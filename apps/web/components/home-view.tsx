"use client";

import { CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "../lib/session";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * Member home. Private content renders only after `GET /v1/me` confirms the
 * session; a signed-out visitor is sent to `/login` (flows §2.3).
 */
export function HomeView() {
  const router = useRouter();
  const session = useSession();
  // Logout leaves with a full page navigation (see AppHeader), so a null
  // session here always means the visitor is not signed in.
  const signedOut = session.isSuccess && session.data === null;

  useEffect(() => {
    if (signedOut) {
      router.replace("/login");
    }
  }, [router, signedOut]);

  if (session.isPending) {
    return <LoadingStatus />;
  }
  if (session.isError) {
    return (
      <div className="grid gap-4">
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>We couldn't load your account.</AlertDescription>
        </Alert>
        <Button
          onClick={() => void session.refetch()}
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    );
  }
  if (session.data === null) {
    // Signed out: the effect above is already redirecting to /login.
    return <LoadingStatus />;
  }

  const { user } = session.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl leading-tight font-semibold">
            Welcome, {user.displayName}
          </h1>
        </CardTitle>
        <CardDescription>
          <Link href={`/u/${user.username}`}>@{user.username}</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p>Your timeline will appear here.</p>
      </CardContent>
    </Card>
  );
}

/** One live status region; the shadcn Spinner inside it is decorative only. */
function LoadingStatus() {
  return (
    <p className="flex items-center gap-2 text-muted-foreground" role="status">
      <Spinner
        aria-hidden="true"
        aria-label={undefined}
        className="motion-reduce:animate-none"
        role="presentation"
      />
      Loading your account…
    </p>
  );
}
