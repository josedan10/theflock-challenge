import {
  type AuthSessionResponse,
  authSessionResponseSchema,
  type CreateTweetRequest,
  type CreateTweetResponse,
  createTweetResponseSchema,
  type ErrorCode,
  errorResponseSchema,
  type FollowListPage,
  followListPageSchema,
  type FollowResponse,
  followResponseSchema,
  type LikeResponse,
  likeResponseSchema,
  type LoginRequest,
  type MarkReadRequest,
  type NotificationPage,
  notificationPageSchema,
  type UnreadCountResponse,
  unreadCountResponseSchema,
  type PublicProfileResponse,
  publicProfileResponseSchema,
  type RegisterRequest,
  type ThreadPage,
  threadPageSchema,
  type TimelinePage,
  timelinePageSchema,
  type UpdateProfileRequest,
  type UserSearchResponse,
  userSearchResponseSchema,
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
  createReply(
    parentId: string,
    input: CreateTweetRequest,
    csrfToken: string,
  ): Promise<CreateTweetResponse>;
  getThread(id: string, cursor?: string): Promise<ThreadPage>;
  /** Likes a tweet; resolves with the committed state and count (US-C02). */
  like(tweetId: string, csrfToken: string): Promise<LikeResponse>;
  /** Removes the member's like; resolves with the committed state and count. */
  unlike(tweetId: string, csrfToken: string): Promise<LikeResponse>;
  /** One page of the member's notifications; cursor as for the timeline. */
  getNotifications(cursor?: string): Promise<NotificationPage>;
  /** The member's unread notification count. */
  getUnreadCount(): Promise<UnreadCountResponse>;
  /** Marks ids or everything read; resolves with the committed count. */
  markNotificationsRead(
    input: MarkReadRequest,
    csrfToken: string,
  ): Promise<UnreadCountResponse>;
  /** Deletes the signed-in member's own tweet. */
  deleteTweet(tweetId: string, csrfToken: string): Promise<void>;
  /**
   * One home-timeline page. `cursor` is the opaque value from the previous
   * page, sent only to this API and never stored. Omit it for the first page.
   */
  getTimeline(cursor?: string): Promise<TimelinePage>;
  /** Credentialed SSE URL for live home-timeline ids (LIVE-01). */
  timelineStreamUrl(): string;
  /** One page of a member's followers or following; cursor as for the timeline. */
  getFollowList(
    username: string,
    direction: FollowListDirection,
    cursor?: string,
  ): Promise<FollowListPage>;
  /** People whose username or display name contains `text` (US-D01). */
  searchUsers(text: string): Promise<UserSearchResponse>;
  /** Follows a member; resolves with the committed relationship and count. */
  follow(username: string, csrfToken: string): Promise<FollowResponse>;
  /** Unfollows a member; resolves with the committed relationship and count. */
  unfollow(username: string, csrfToken: string): Promise<FollowResponse>;
}

/** Which follow list of a member to read. */
export type FollowListDirection = "followers" | "following";

interface RequestOptions {
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
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
    async createReply(parentId, input, csrfToken) {
      const response = await request(
        `/tweets/${encodeURIComponent(parentId)}/replies`,
        { body: input, method: "POST", csrfToken },
      );
      return createTweetResponseSchema.parse(await response.json());
    },
    async getThread(id, cursor) {
      const query =
        cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
      const response = await request(
        `/tweets/${encodeURIComponent(id)}/thread${query}`,
        { method: "GET" },
      );
      return threadPageSchema.parse(await response.json());
    },
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
    async follow(username, csrfToken) {
      const response = await request(
        `/users/${encodeURIComponent(username)}/follow`,
        { csrfToken, method: "PUT" },
      );
      return followResponseSchema.parse(await response.json());
    },
    async getFollowList(username, direction, cursor) {
      const query =
        cursor === undefined
          ? ""
          : `?${new URLSearchParams({ cursor }).toString()}`;
      const response = await request(
        `/users/${encodeURIComponent(username)}/${direction}${query}`,
        { method: "GET" },
      );
      return followListPageSchema.parse(await response.json());
    },
    async getNotifications(cursor) {
      const query =
        cursor === undefined
          ? ""
          : `?${new URLSearchParams({ cursor }).toString()}`;
      const response = await request(`/notifications${query}`, {
        method: "GET",
      });
      return notificationPageSchema.parse(await response.json());
    },
    async getUnreadCount() {
      const response = await request("/notifications/unread-count", {
        method: "GET",
      });
      return unreadCountResponseSchema.parse(await response.json());
    },
    async markNotificationsRead(input, csrfToken) {
      const response = await request("/notifications/read", {
        body: input,
        csrfToken,
        method: "POST",
      });
      return unreadCountResponseSchema.parse(await response.json());
    },
    async getProfile(username) {
      const response = await request(`/users/${encodeURIComponent(username)}`, {
        method: "GET",
      });
      return publicProfileResponseSchema.parse(await response.json());
    },
    timelineStreamUrl() {
      return `${baseUrl}/v1/timeline/stream`;
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
    async like(tweetId, csrfToken) {
      const response = await request(
        `/tweets/${encodeURIComponent(tweetId)}/like`,
        { csrfToken, method: "PUT" },
      );
      return likeResponseSchema.parse(await response.json());
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
    async searchUsers(text) {
      const query = new URLSearchParams({ q: text }).toString();
      const response = await request(`/users/search?${query}`, {
        method: "GET",
      });
      return userSearchResponseSchema.parse(await response.json());
    },
    async unlike(tweetId, csrfToken) {
      const response = await request(
        `/tweets/${encodeURIComponent(tweetId)}/like`,
        { csrfToken, method: "DELETE" },
      );
      return likeResponseSchema.parse(await response.json());
    },
    async unfollow(username, csrfToken) {
      const response = await request(
        `/users/${encodeURIComponent(username)}/follow`,
        { csrfToken, method: "DELETE" },
      );
      return followResponseSchema.parse(await response.json());
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
