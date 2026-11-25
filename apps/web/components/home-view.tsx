"use client";

import { CircleAlertIcon, RotateCwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "../lib/session";
import { useHydrated } from "../lib/use-hydrated";

import { HomeSkeleton } from "./skeletons";
import { TimelineFeed } from "./timeline-feed";
import { TweetComposer } from "./tweet-composer";

import type { SessionUser } from "@twitter-clone/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Member home. Private content renders only after `GET /v1/me` confirms the
 * session; a signed-out visitor is sent to `/login` (flows §2.3).
 */
export function HomeView() {
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  // Logout leaves with a full page navigation (see AppHeader), so a null
  // session here always means the visitor is not signed in.
  const signedOut = session.isSuccess && session.data === null;

  useEffect(() => {
    if (signedOut) {
      router.replace("/login");
    }
  }, [router, signedOut]);

  // Until hydration ends, match the server HTML even if the header has
  // already loaded the session.
  if (!hydrated || session.isPending) {
    return <HomeSkeleton label="Loading your account…" />;
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
          <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
          Try again
        </Button>
      </div>
    );
  }
  if (session.data === null) {
    // Signed out: the effect above is already redirecting to /login.
    return <HomeSkeleton label="Loading your account…" />;
  }

  return <MemberHome user={session.data.user} />;
}

/**
 * The member's home: composer and the home timeline (US-B03).
 */
function MemberHome({ user }: Readonly<{ user: SessionUser }>) {
  return (
    <div className="grid gap-6">
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
        <CardContent>
          <TweetComposer member={{ id: user.id, username: user.username }} />
        </CardContent>
      </Card>
      <TimelineFeed user={user} />
    </div>
  );
}
