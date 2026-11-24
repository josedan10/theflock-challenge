"use client";

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";

import type { ApiClient } from "./api-client";
import type {
  AuthSessionResponse,
  LoginRequest,
  PublicProfileResponse,
  RegisterRequest,
  UpdateProfileRequest,
} from "@twitter-clone/contracts";

const SESSION_KEY = ["session"] as const;

const ApiClientContext = createContext<ApiClient | null>(null);

/**
 * CSRF token of the cached session, for cookie-authenticated mutations.
 *
 * @throws {Error} When no session is cached; callers only mount for members.
 */
export function sessionCsrfToken(queryClient: QueryClient): string {
  const session = queryClient.getQueryData<AuthSessionResponse | null>(
    SESSION_KEY,
  );
  if (session === undefined || session === null) {
    throw new Error("This action requires an authenticated session.");
  }
  return session.csrfToken;
}

/** The API client from the nearest SessionProvider. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === null) {
    throw new Error("useApiClient must be used inside <SessionProvider>");
  }
  return client;
}

/**
 * Provides the API client and a query cache holding the current session.
 * The CSRF token lives only in this in-memory cache, never in storage.
 */
export function SessionProvider({
  apiClient,
  children,
}: Readonly<{ apiClient: ApiClient; children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Auth failures are answered by the server, not fixed by retrying.
          mutations: { retry: false },
          queries: { refetchOnWindowFocus: false, retry: false },
        },
      }),
  );

  return (
    <ApiClientContext.Provider value={apiClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

/** The current session from `GET /v1/me`; `data` is `null` when signed out. */
export function useSession() {
  const apiClient = useApiClient();
  return useQuery({
    queryFn: () => apiClient.me(),
    queryKey: SESSION_KEY,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Public profile data keyed by its normalized route username. */
export function usePublicProfile(username: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryFn: () => apiClient.getProfile(username),
    queryKey: ["profile", username.toLowerCase()],
  });
}

/** Updates the signed-in member's profile and reconciles profile/session caches. */
export function useUpdateProfile(username: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileRequest) =>
      apiClient.updateProfile(input, sessionCsrfToken(queryClient)),
    onSuccess: (response: PublicProfileResponse) => {
      queryClient.setQueryData(["profile", username.toLowerCase()], response);
      queryClient.setQueryData<AuthSessionResponse | null>(
        SESSION_KEY,
        (session) =>
          session === undefined || session === null
            ? session
            : {
                ...session,
                user: {
                  ...session.user,
                  avatarUrl: response.profile.avatarUrl,
                  bio: response.profile.bio,
                  displayName: response.profile.displayName,
                },
              },
      );
    },
  });
}

function useSessionMutation<Input>(
  mutationFn: (
    apiClient: ApiClient,
    input: Input,
  ) => Promise<AuthSessionResponse>,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => mutationFn(apiClient, input),
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_KEY, session);
    },
  });
}

export function useRegister() {
  return useSessionMutation((apiClient, input: RegisterRequest) =>
    apiClient.register(input),
  );
}

export function useLogIn() {
  return useSessionMutation((apiClient, input: LoginRequest) =>
    apiClient.logIn(input),
  );
}

/** Logs out with the cached CSRF token and forgets the session locally. */
/**
 * Revokes the session with the cached CSRF token. The cache is left as is:
 * callers leave with a full page navigation (`leaveTo`), which discards it,
 * so no protected screen sees a cleared session and redirects first.
 */
export function useLogOut() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const session = queryClient.getQueryData<AuthSessionResponse | null>(
        SESSION_KEY,
      );
      return apiClient.logOut(session?.csrfToken ?? null);
    },
  });
}
