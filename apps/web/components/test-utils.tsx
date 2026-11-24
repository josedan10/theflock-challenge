import { render } from "@testing-library/react";
import { vi } from "vitest";

import { SessionProvider } from "../lib/session";

import type { ApiClient } from "../lib/api-client";
import type { AuthSessionResponse } from "@twitter-clone/contracts";
import type { ReactElement } from "react";

export const testSession: AuthSessionResponse = {
  csrfToken: "c".repeat(43),
  user: {
    avatarUrl: null,
    bio: "",
    createdAt: "2026-11-24T12:00:00.000Z",
    displayName: "Ada",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    username: "ada",
  },
};

export function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    logIn: vi.fn(async () => testSession),
    logOut: vi.fn(async () => undefined),
    me: vi.fn(async () => null),
    register: vi.fn(async () => testSession),
    ...overrides,
  };
}

export function renderWithSession(
  ui: ReactElement,
  apiClient: ApiClient = fakeApiClient(),
) {
  return {
    apiClient,
    ...render(<SessionProvider apiClient={apiClient}>{ui}</SessionProvider>),
  };
}
