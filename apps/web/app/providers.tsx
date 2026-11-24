"use client";

import { useState, type ReactNode } from "react";

import { createApiClient } from "../lib/api-client";
import { SessionProvider } from "../lib/session";

/**
 * `NEXT_PUBLIC_API_URL` is inlined at build time, so it must be set when the
 * web app is built for each environment.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [apiClient] = useState(() => createApiClient(API_BASE_URL));
  return <SessionProvider apiClient={apiClient}>{children}</SessionProvider>;
}
