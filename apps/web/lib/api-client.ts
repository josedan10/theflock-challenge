import {
  type AuthSessionResponse,
  authSessionResponseSchema,
  type CreateTweetRequest,
  type CreateTweetResponse,
  createTweetResponseSchema,
  type ErrorCode,
  errorResponseSchema,
  type LoginRequest,
  type PublicProfileResponse,
  publicProfileResponseSchema,
  type RegisterRequest,
  type TimelinePage,
  timelinePageSchema,
  type UpdateProfileRequest,
} from "@twitter-clone/contracts";

/** `NETWORK_ERROR` means the API could not be reached at all. */
export type ApiErrorCode = ErrorCode | "NETWORK_ERROR";

/** A failed API call, carrying the contract error code and any field messages. */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

export interface ApiClient {
  register(input: RegisterRequest): Promise<AuthSessionResponse>;
  logIn(input: LoginRequest): Promise<AuthSessionResponse>;
  logOut(csrfToken: string | null): Promise<void>;
  /** The current session, or `null` when not signed in. */
  me(): Promise<AuthSessionResponse | null>;
  getProfile(username: string): Promise<PublicProfileResponse>;
  updateProfile(
    input: UpdateProfileRequest,
    csrfToken: string,
  ): Promise<PublicProfileResponse>;
  /** Publishes a tweet; resolves with the canonical card from the API. */
  createTweet(
    input: CreateTweetRequest,
    csrfToken: string,
  ): Promise<CreateTweetResponse>;
  /** Deletes the signed-in member's own tweet. */
  deleteTweet(tweetId: string, csrfToken: string): Promise<void>;
  /**
   * One home-timeline page. `cursor` is the opaque value from the previous
   * page, sent only to this API and never stored. Omit it for the first page.
   */
  getTimeline(cursor?: string): Promise<TimelinePage>;
}

interface RequestOptions {
  method: "DELETE" | "GET" | "PATCH" | "POST";
  body?: unknown;
  csrfToken?: string | null;
}

/**
 * Creates a client for the API. Every request sends cookies
 * (`credentials: "include"`) because the session lives in an HTTP-only cookie
 * the page cannot read; mutations add the in-memory CSRF token.
 */
export function createApiClient(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiClient {
  async function request(
    path: string,
    options: RequestOptions,
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (options.csrfToken) {
      headers["x-csrf-token"] = options.csrfToken;
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/v1${path}`, {
        credentials: "include",
        headers,
        method: options.method,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "Can't reach the server. Check your connection and try again.",
      );
    }

    if (!response.ok) {
      throw await toApiError(response);
    }
    return response;
  }

  async function session(
    path: string,
    body: unknown,
  ): Promise<AuthSessionResponse> {
    const response = await request(path, { body, method: "POST" });
    return authSessionResponseSchema.parse(await response.json());
  }

  return {
    async createTweet(input, csrfToken) {
      const response = await request("/tweets", {
        body: input,
        csrfToken,
        method: "POST",
      });
      return createTweetResponseSchema.parse(await response.json());
    },
    async deleteTweet(tweetId, csrfToken) {
      await request(`/tweets/${encodeURIComponent(tweetId)}`, {
        csrfToken,
        method: "DELETE",
      });
    },
    async getProfile(username) {
      const response = await request(`/users/${encodeURIComponent(username)}`, {
        method: "GET",
      });
      return publicProfileResponseSchema.parse(await response.json());
    },
    async getTimeline(cursor) {
      const params = new URLSearchParams();
      if (cursor !== undefined) {
        params.set("cursor", cursor);
      }
      const query = params.size === 0 ? "" : `?${params.toString()}`;
      const response = await request(`/timeline${query}`, { method: "GET" });
      return timelinePageSchema.parse(await response.json());
    },
    async logIn(input) {
      return session("/auth/login", input);
    },
    async logOut(csrfToken) {
      await request("/auth/logout", { csrfToken, method: "POST" });
    },
    async me() {
      try {
        const response = await request("/me", { method: "GET" });
        return authSessionResponseSchema.parse(await response.json());
      } catch (error: unknown) {
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
          return null;
        }
        throw error;
      }
    },
    async register(input) {
      return session("/auth/register", input);
    },
    async updateProfile(input, csrfToken) {
      const response = await request("/me/profile", {
        body: input,
        csrfToken,
        method: "PATCH",
      });
      return publicProfileResponseSchema.parse(await response.json());
    },
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = errorResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) {
    return new ApiError(
      response.status,
      "INTERNAL_ERROR",
      "Something went wrong. Please try again.",
    );
  }
  const { code, fields, message } = parsed.data.error;
  return new ApiError(response.status, code, message, fields);
}
