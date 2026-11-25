"use client";

import { HeartIcon, MessageCircleIcon } from "lucide-react";
import Link from "next/link";

import { formatCount } from "../lib/format-count";
import { useLikeTweet } from "../lib/likes";
import { threadHref } from "../lib/navigation";
import { cn } from "../lib/utils";

import type { Tweet } from "@twitter-clone/contracts";

const action =
  "group/action inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground no-underline transition-colors sm:min-h-9";
const iconWrap =
  "grid size-8 place-items-center rounded-full transition-colors";

const plural = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

/** Count next to an icon; hidden at zero, like Twitter. */
function Count({ value }: Readonly<{ value: number }>) {
  return (
    <span aria-hidden="true" className="min-w-4 tabular-nums">
      {value === 0 ? "" : formatCount(value)}
    </span>
  );
}

/**
 * Chat bubble: opens the tweet's thread, or runs `onReply` (focus the reply
 * box) when the thread is already open. Named with its reply count.
 */
function ReplyAction({
  loginToReply,
  onReply,
  tweet,
}: Readonly<{
  loginToReply: boolean;
  onReply?: (() => void) | undefined;
  tweet: Tweet;
}>) {
  const count = plural(tweet.replyCount, "reply", "replies");
  const label = loginToReply
    ? `Log in to reply, ${count}`
    : `Open thread, ${count}`;
  const content = (
    <>
      <span
        className={cn(
          iconWrap,
          "group-hover/action:bg-sky-500/10 group-hover/action:text-sky-600",
        )}
      >
        <MessageCircleIcon aria-hidden="true" className="size-[18px]" />
      </span>
      <Count value={tweet.replyCount} />
    </>
  );
  if (onReply !== undefined) {
    return (
      <button
        aria-label={`Reply, ${count}`}
        className={cn(action, "hover:text-sky-600")}
        onClick={onReply}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <Link
      aria-label={label}
      className={cn(action, "hover:text-sky-600")}
      href={loginToReply ? "/login" : threadHref(tweet.id)}
    >
      {content}
    </Link>
  );
}

const likedTone = "text-rose-600 dark:text-rose-400";

/** Heart toggle for a signed-in member (US-C02). */
function LikeAction({ tweet }: Readonly<{ tweet: Tweet }>) {
  const mutation = useLikeTweet(tweet.id);
  const liked = tweet.likedByViewer;
  return (
    <button
      aria-label={`Like, ${plural(tweet.likeCount, "like", "likes")}`}
      aria-pressed={liked}
      className={cn(action, liked ? likedTone : "hover:text-rose-600")}
      disabled={mutation.isPending}
      onClick={() =>
        mutation.mutate({
          like: !liked,
          previous: { likeCount: tweet.likeCount, likedByViewer: liked },
        })
      }
      type="button"
    >
      <span
        className={cn(
          iconWrap,
          "group-hover/action:bg-rose-500/10",
          liked ? "like-pop" : undefined,
        )}
      >
        <HeartIcon
          aria-hidden="true"
          className={cn("size-[18px]", liked ? "fill-current" : undefined)}
        />
      </span>
      <Count value={tweet.likeCount} />
    </button>
  );
}

/** Signed-out visitors see the count and are invited to log in to like. */
function GuestLikeAction({ tweet }: Readonly<{ tweet: Tweet }>) {
  return (
    <Link
      aria-label={`Log in to like, ${plural(tweet.likeCount, "like", "likes")}`}
      className={cn(action, "hover:text-rose-600")}
      href="/login"
    >
      <span className={iconWrap}>
        <HeartIcon aria-hidden="true" className="size-[18px]" />
      </span>
      <Count value={tweet.likeCount} />
    </Link>
  );
}

/**
 * The action bar under a tweet: reply bubble, then like heart. On a thread's
 * focused tweet (`inThread`) the bubble focuses the reply box, or sends a
 * signed-out reader to log in, instead of linking to the same page.
 */
export function TweetActions({
  inThread = false,
  onReply,
  tweet,
  viewerId,
}: Readonly<{
  inThread?: boolean;
  onReply?: (() => void) | undefined;
  tweet: Tweet;
  viewerId: string | null;
}>) {
  return (
    <div className="-ml-2 flex items-center gap-6">
      <ReplyAction
        loginToReply={inThread && onReply === undefined}
        onReply={onReply}
        tweet={tweet}
      />
      {viewerId === null ? (
        <GuestLikeAction tweet={tweet} />
      ) : (
        <LikeAction tweet={tweet} />
      )}
    </div>
  );
}
