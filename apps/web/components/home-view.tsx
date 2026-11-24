"use client";

import { CircleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFormErrors } from "../lib/form-errors";
import { useLogOut, useSession } from "../lib/session";

import { buttonClass, headingClass } from "./styles";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Member home. Private content renders only after `GET /v1/me` confirms the
 * session; a signed-out visitor is sent to `/login` (flows §2.3).
 */
export function HomeView() {
  const router = useRouter();
  const session = useSession();
  const logOut = useLogOut();
  const [error, setError] = useState<string | null>(null);
  // A logout clears the session too; only an unexpected sign-out goes to /login.
  const loggingOut = logOut.isPending || logOut.isSuccess;
  const signedOut = session.isSuccess && session.data === null && !loggingOut;

  useEffect(() => {
    if (signedOut) {
      router.replace("/login");
    }
  }, [router, signedOut]);

  if (session.isPending) {
    return <p role="status">Loading your account…</p>;
  }
  if (session.isError) {
    return (
      <div className="grid gap-4">
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>We couldn't load your account.</AlertDescription>
        </Alert>
        <button
          className={buttonClass}
          onClick={() => void session.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }
  if (session.data === null) {
    // Signed out: the effect above is already redirecting to /login.
    return <p role="status">Loading your account…</p>;
  }

  const { user } = session.data;
  return (
    <div className="grid gap-4">
      <h1 className={headingClass}>Welcome, {user.displayName}</h1>
      <p className="text-muted-foreground">@{user.username}</p>
      <p>Your timeline will appear here.</p>
      {error === null ? null : (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <button
        aria-busy={logOut.isPending}
        className={buttonClass}
        disabled={logOut.isPending}
        onClick={() =>
          logOut.mutate(undefined, {
            onError: (failure) => setError(apiFormErrors(failure).form),
            onSuccess: () => router.replace("/"),
          })
        }
        type="button"
      >
        {logOut.isPending ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
