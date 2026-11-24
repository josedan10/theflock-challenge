"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFormErrors } from "../lib/form-errors";
import { useLogOut, useSession } from "../lib/session";

import { FormAlert } from "./form-alert";
import { buttonClass, headingClass } from "./styles";

/**
 * Member home. Private content renders only after `GET /v1/me` confirms the
 * session; a signed-out visitor is sent to `/login` (flows §2.3).
 */
export function HomeView() {
  const router = useRouter();
  const session = useSession();
  const logOut = useLogOut();
  const [error, setError] = useState<string | null>(null);
  const signedOut = session.isSuccess && session.data === null;

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
        <FormAlert message="We couldn't load your account." />
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
      <p className="text-muted">@{user.username}</p>
      <p>Your timeline will appear here.</p>
      <FormAlert message={error} />
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
