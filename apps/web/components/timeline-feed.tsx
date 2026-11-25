"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  RotateCwIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api-client";
import { apiFormErrors } from "../lib/form-errors";
import {
  clearUndoWindows,
  closeUndoWindow,
  useUndoWindows,
} from "../lib/post-undo";
import { assembleTimeline, tweetsAheadOfPage } from "../lib/timeline-feed";
import {
  useDeleteTweet,
  useHomeTimeline,
  usePendingTweets,
  useTimelineLive,
} from "../lib/tweets";

import { PostUndo } from "./post-undo";
import { TimelineSkeleton } from "./skeletons";
import { TweetCard } from "./tweet-card";

import type { SessionUser } from "@twitter-clone/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

/** Why a delete failed, shown on that tweet's card. */
interface DeleteFailure {
  tweetId: string;
  message: string;
}

/**
 * Home timeline (US-B03, FEED-02, LIVE-01). Pages come from `GET /v1/timeline`.
 * Tweet text is rendered as text. The cursor never leaves the query cache.
 * Live ids arrive over SSE and merge into the pending list without moving
 * focus.
 */
export function TimelineFeed({ user }: Readonly<{ user: SessionUser }>) {
  const router = useRouter();
  const member = { id: user.id, username: user.username };
  const pending = usePendingTweets(user.id);
  const timeline = useHomeTimeline(user.id);
  const liveAnnouncement = useTimelineLive(user.id, timeline.isSuccess);
  const deleteTweet = useDeleteTweet(member);
  const queryClient = useQueryClient();
  const undoWindows = useUndoWindows(user.id);
  const [undoing, setUndoing] = useState<string | null>(null);
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
  const itemIds = items.map((tweet) => tweet.id).join("\n");

  const settled = timeline.isSuccess || timeline.isError;
  const [trackedIds, setTrackedIds] = useState<{
    appearing: ReadonlySet<string>;
    itemIds: string;
    settled: boolean;
  }>({ appearing: new Set(), itemIds: "", settled: false });
  if (trackedIds.itemIds !== itemIds || trackedIds.settled !== settled) {
    const appearing = new Set<string>();
    // The first settled list is the page the member opened. Only tweets
    // prepended after that get the entrance animation.
    if (trackedIds.settled && settled) {
      const known = new Set(
        trackedIds.itemIds === "" ? [] : trackedIds.itemIds.split("\n"),
      );
      const next = itemIds === "" ? [] : itemIds.split("\n");
      for (const id of next) {
        if (known.has(id)) {
          break;
        }
        appearing.add(id);
      }
    }
    setTrackedIds({ appearing, itemIds, settled });
  }
  const appearing = trackedIds.appearing;

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

  // Leaving the timeline ends every undo window; the posts stay (AC-B01.7).
  useEffect(
    () => () => clearUndoWindows(queryClient, user.id),
    [queryClient, user.id],
  );

  /** Undo a new post: delete it without the confirmation (AC-B01.6). */
  function onUndo(tweetId: string) {
    setFailure(null);
    setUndoing(tweetId);
    deleteTweet.mutate(tweetId, {
      onError: (error) => {
        if (error instanceof ApiError && error.code === "NOT_FOUND") {
          closeUndoWindow(queryClient, user.id, tweetId);
          return;
        }
        // The tweet stays, and the card's alert announces why (AC-B01.7).
        setFailure({
          message:
            `We couldn't undo this post. ${apiFormErrors(error).form ?? ""}`.trim(),
          tweetId,
        });
      },
      onSettled: () => setUndoing(null),
      onSuccess: () => closeUndoWindow(queryClient, user.id, tweetId),
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
          Home
        </h2>
        {liveAnnouncement === "" ? null : (
          <p className="sr-only" role="status">
            {liveAnnouncement}
          </p>
        )}
      </div>

      {deferNewPosts && ahead.length > 0 ? (
        <p role="status">
          <Button onClick={showNewPosts} type="button" variant="outline">
            <ArrowUpIcon aria-hidden="true" data-icon="inline-start" />
            Show {ahead.length} new {ahead.length === 1 ? "post" : "posts"}
          </Button>
        </p>
      ) : null}

      {timeline.isPending && items.length === 0 ? (
        <TimelineSkeleton label="Loading your timeline…" />
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
            <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : null}

      {items.length === 0 && timeline.isSuccess ? (
        <div className="grid justify-items-start gap-3">
          <p>
            Your timeline is empty. Post a tweet above, or search for people and
            follow them to see their posts here.
          </p>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/search"
          >
            <SearchIcon aria-hidden="true" data-icon="inline-start" />
            Find people
          </Link>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ol
          aria-labelledby="home-timeline-heading"
          className="content-enter grid gap-3"
        >
          {items.map((tweet) => (
            <li
              className={appearing.has(tweet.id) ? "tweet-appear" : undefined}
              key={tweet.id}
            >
              <TweetCard
                failure={failure?.tweetId === tweet.id ? failure.message : null}
                footer={
                  undoWindows[tweet.id] === undefined ? null : (
                    <PostUndo
                      expiresAt={undoWindows[tweet.id] ?? 0}
                      onExpire={() =>
                        closeUndoWindow(queryClient, user.id, tweet.id)
                      }
                      onUndo={() => onUndo(tweet.id)}
                      pending={undoing === tweet.id}
                    />
                  )
                }
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
            <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : null}

      {timeline.hasNextPage === true ? (
        <div className="grid justify-items-center gap-3">
          {timeline.isFetchingNextPage ? (
            <TimelineSkeleton count={2} label="Loading older posts…" />
          ) : null}
          <Button
            disabled={timeline.isFetchingNextPage}
            onClick={loadOlder}
            type="button"
            variant="outline"
          >
            <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
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
