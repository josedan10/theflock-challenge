"use client";

import { CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "../lib/api-client";
import { apiFormErrors } from "../lib/form-errors";
import { useSession } from "../lib/session";
import { useDeleteTweet, usePostedTweets } from "../lib/tweets";

import { TweetCard } from "./tweet-card";
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

  return <MemberHome user={session.data.user} />;
}

/** Why a delete failed, shown on that tweet's card. */
interface DeleteFailure {
  tweetId: string;
  message: string;
}

/**
 * The member's home: composer and the tweets posted in this visit. Nothing
 * lists tweets until the timeline exists (FEED-01), which the copy says.
 */
function MemberHome({ user }: Readonly<{ user: SessionUser }>) {
  const member = { id: user.id, username: user.username };
  const posted = usePostedTweets(user.id);
  const deleteTweet = useDeleteTweet(member);
  const [failure, setFailure] = useState<DeleteFailure | null>(null);

  function onDelete(tweetId: string) {
    setFailure(null);
    deleteTweet.mutate(tweetId, {
      onError: (error) => {
        // A 404 means it is already gone; the list keeps it removed.
        if (error instanceof ApiError && error.code === "NOT_FOUND") {
          return;
        }
        setFailure({
          message:
            `We couldn't delete this tweet. ${apiFormErrors(error).form ?? ""}`.trim(),
          tweetId,
        });
      },
    });
  }

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
          <TweetComposer member={member} />
        </CardContent>
      </Card>

      <section aria-labelledby="new-posts-heading" className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold" id="new-posts-heading">
            Your new posts
          </h2>
          <p className="text-sm text-muted-foreground">
            Posts from this visit. Your timeline with people you follow is
            coming soon.
          </p>
        </div>
        {posted.data.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing posted yet. Share your first tweet above.
          </p>
        ) : (
          <ol aria-labelledby="new-posts-heading" className="grid gap-3">
            {posted.data.map((tweet) => (
              <li key={tweet.id}>
                <TweetCard
                  failure={
                    failure?.tweetId === tweet.id ? failure.message : null
                  }
                  onDelete={onDelete}
                  tweet={tweet}
                  viewerId={user.id}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
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
