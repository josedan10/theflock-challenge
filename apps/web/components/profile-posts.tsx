"use client";

import { ChevronDownIcon, CircleAlertIcon, RotateCwIcon } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api-client";
import { apiFormErrors } from "../lib/form-errors";
import { useDeleteTweet, useProfilePosts } from "../lib/tweets";

import { TimelineSkeleton } from "./skeletons";
import { TweetCard } from "./tweet-card";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

/** Why a delete failed, shown on that tweet's card. */
interface DeleteFailure {
  tweetId: string;
  message: string;
}

/**
 * Tweets and replies on a profile (PROFILE-03, AC-A03.4). Newest first, with
 * the same card actions as the home timeline. The cursor stays in the query
 * cache. Empty, error, and end states are explicit.
 */
export function ProfilePosts({
  username,
  viewerId,
}: Readonly<{ username: string; viewerId: string | null }>) {
  const posts = useProfilePosts(username, true);
  const remove = useDeleteTweet({ id: viewerId ?? "", username });
  const [failure, setFailure] = useState<DeleteFailure | null>(null);
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];

  function onDelete(tweetId: string) {
    setFailure(null);
    remove.mutate(tweetId, {
      onError: (error) => {
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
    <section aria-labelledby="profile-posts-heading" className="grid gap-3">
      <h2 className="text-lg font-semibold" id="profile-posts-heading">
        Posts
      </h2>

      {posts.isPending ? <TimelineSkeleton label="Loading posts…" /> : null}

      {posts.isError && !posts.isFetchNextPageError ? (
        <div className="grid gap-4">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>We couldn't load these posts.</AlertDescription>
          </Alert>
          <Button
            onClick={() => void posts.refetch()}
            type="button"
            variant="outline"
          >
            <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : null}

      {posts.isSuccess && items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No posts yet.</EmptyTitle>
            <EmptyDescription>
              Tweets and replies from @{username} show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {items.length > 0 ? (
        <ol aria-labelledby="profile-posts-heading" className="grid gap-3">
          {items.map((tweet) => (
            <li key={tweet.id}>
              <TweetCard
                failure={
                  failure !== null && failure.tweetId === tweet.id
                    ? failure.message
                    : null
                }
                replyingTo={tweet.replyingTo}
                tweet={tweet}
                viewerId={viewerId}
                {...(viewerId === null ? {} : { onDelete })}
              />
            </li>
          ))}
        </ol>
      ) : null}

      {posts.isFetchNextPageError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>We couldn't load older posts.</AlertDescription>
        </Alert>
      ) : null}

      {posts.hasNextPage === true ? (
        <div className="grid justify-items-center gap-3">
          {posts.isFetchingNextPage ? (
            <TimelineSkeleton count={2} label="Loading older posts…" />
          ) : null}
          <Button
            disabled={posts.isFetchingNextPage}
            onClick={() => void posts.fetchNextPage()}
            type="button"
            variant="outline"
          >
            {posts.isFetchNextPageError ? (
              <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
            ) : (
              <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {posts.isFetchNextPageError ? "Try again" : "Load more"}
          </Button>
        </div>
      ) : null}

      {posts.isSuccess && posts.hasNextPage !== true && items.length > 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          That's everything.
        </p>
      ) : null}
    </section>
  );
}
