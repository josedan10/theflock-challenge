"use client";

import { CircleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api-client";
import { apiFormErrors } from "../lib/form-errors";
import { assembleTimeline, tweetsAheadOfPage } from "../lib/timeline-feed";
import {
  useDeleteTweet,
  useHomeTimeline,
  usePendingTweets,
} from "../lib/tweets";

import { TweetCard } from "./tweet-card";

import type { SessionUser } from "@twitter-clone/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Why a delete failed, shown on that tweet's card. */
interface DeleteFailure {
  tweetId: string;
  message: string;
}

/**
 * Home timeline (US-B03, FEED-02). Pages come from `GET /v1/timeline`. Tweet
 * text is rendered as text. The cursor never leaves the query cache.
 */
export function TimelineFeed({ user }: Readonly<{ user: SessionUser }>) {
  const router = useRouter();
  const member = { id: user.id, username: user.username };
  const pending = usePendingTweets(user.id);
  const timeline = useHomeTimeline(user.id);
  const deleteTweet = useDeleteTweet(member);
  const [deferNewPosts, setDeferNewPosts] = useState(false);
  const [failure, setFailure] = useState<DeleteFailure | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const requestLock = useRef(false);
  const timelineRef = useRef(timeline);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  const firstPage = timeline.data?.pages[0]?.items ?? [];
  const ahead = tweetsAheadOfPage(pending.data, firstPage);
  const items = assembleTimeline(
    pending.data,
    timeline.data?.pages,
    !deferNewPosts,
  );

  const loadOlder = useCallback(() => {
    const current = timelineRef.current;
    if (
      requestLock.current ||
      current.hasNextPage !== true ||
      current.isFetchingNextPage
    ) {
      return;
    }
    requestLock.current = true;
    // Older pages mean the member is reading; new posts wait on the banner.
    setDeferNewPosts(true);
    void current.fetchNextPage().finally(() => {
      requestLock.current = false;
    });
  }, []);

  useEffect(() => {
    if (
      timeline.error instanceof ApiError &&
      timeline.error.code === "UNAUTHENTICATED"
    ) {
      router.replace("/login");
    }
  }, [router, timeline.error]);

  const pageCount = timeline.data?.pages.length ?? 0;
  useEffect(() => {
    const node = sentinel.current;
    if (
      node === null ||
      timeline.hasNextPage !== true ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadOlder();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadOlder, pageCount, timeline.hasNextPage]);

  function onDelete(tweetId: string) {
    setFailure(null);
    deleteTweet.mutate(tweetId, {
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

  function showNewPosts() {
    setDeferNewPosts(false);
    if (typeof heading.current?.scrollIntoView === "function") {
      heading.current.scrollIntoView({ block: "start" });
    }
  }

  const showInitialError =
    timeline.isError &&
    !timeline.isFetchNextPageError &&
    items.length === 0 &&
    !(
      timeline.error instanceof ApiError &&
      timeline.error.code === "UNAUTHENTICATED"
    );

  return (
    <section aria-labelledby="home-timeline-heading" className="grid gap-3">
      <div className="grid gap-1">
        <h2
          className="text-lg font-semibold"
          id="home-timeline-heading"
          ref={heading}
        >
          Home timeline
        </h2>
        <p className="text-sm text-muted-foreground">
          Tweets from you and the people you follow, newest first.
        </p>
      </div>

      {deferNewPosts && ahead.length > 0 ? (
        <p role="status">
          <Button onClick={showNewPosts} type="button" variant="outline">
            Show {ahead.length} new {ahead.length === 1 ? "post" : "posts"}
          </Button>
        </p>
      ) : null}

      {timeline.isPending && items.length === 0 ? (
        <LoadingOlder label="Loading your timeline…" />
      ) : null}

      {showInitialError ? (
        <div className="grid gap-4">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>We couldn't load your timeline.</AlertDescription>
          </Alert>
          <Button
            onClick={() => void timeline.refetch()}
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : null}

      {items.length === 0 && timeline.isSuccess ? (
        <p>
          Your timeline is empty. Post a tweet above, or search for people and
          follow them to see their posts here.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ol aria-labelledby="home-timeline-heading" className="grid gap-3">
          {items.map((tweet) => (
            <li key={tweet.id}>
              <TweetCard
                failure={failure?.tweetId === tweet.id ? failure.message : null}
                onDelete={onDelete}
                tweet={tweet}
                viewerId={user.id}
              />
            </li>
          ))}
        </ol>
      ) : null}

      {timeline.isFetchNextPageError ? (
        <div className="grid gap-4">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>We couldn't load older posts.</AlertDescription>
          </Alert>
          <Button onClick={loadOlder} type="button" variant="outline">
            Try again
          </Button>
        </div>
      ) : null}

      {timeline.hasNextPage === true ? (
        <div className="grid justify-items-center gap-3">
          {timeline.isFetchingNextPage ? (
            <LoadingOlder label="Loading older posts…" />
          ) : null}
          <Button
            disabled={timeline.isFetchingNextPage}
            onClick={loadOlder}
            type="button"
            variant="outline"
          >
            Load more
          </Button>
          <div aria-hidden="true" className="h-px w-full" ref={sentinel} />
        </div>
      ) : null}

      {timeline.isSuccess &&
      timeline.hasNextPage !== true &&
      items.length > 0 ? (
        <p role="status">You've reached the end of your timeline.</p>
      ) : null}
    </section>
  );
}

function LoadingOlder({ label }: Readonly<{ label: string }>) {
  return (
    <p className="flex items-center gap-2 text-muted-foreground" role="status">
      <Spinner
        aria-hidden="true"
        aria-label={undefined}
        className="motion-reduce:animate-none"
        role="presentation"
      />
      {label}
    </p>
  );
}
