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
  RegisterRequest,
} from "@twitter-clone/contracts";

const SESSION_KEY = ["session"] as const;

const ApiClientContext = createContext<ApiClient | null>(null);

function useApiClient(): ApiClient {
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
    onSuccess: () => {
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });
}
