"use client";

import { CircleAlertIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { compactTime } from "../lib/relative-time";
import { cn } from "../lib/utils";

import { TweetActions } from "./tweet-actions";

import type { Tweet } from "@twitter-clone/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const fullTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
});

/** The attached picture. `alt` is the author's description (AC-F02.4). */
function TweetImage({ image }: Readonly<{ image: Tweet["image"] }>) {
  if (image === null) {
    return null;
  }
  return (
    // The API already rewrote the bytes and serves them from its own origin.
    // The Next image optimizer would fetch that URL server-side, which we do not need.
    <img
      alt={image.alt}
      className="mt-1 max-h-96 w-full rounded-xl border object-contain"
      height={image.height}
      src={image.url}
      width={image.width}
    />
  );
}

export interface TweetCardProps {
  tweet: Tweet;
  /** The signed-in member's id, or `null` when signed out. */
  viewerId: string | null;
  /**
   * `card`: a bordered card (home timeline). `row`: a borderless row inside a
   * conversation. `focus`: the tweet a thread page is about, larger.
   */
  variant?: "card" | "focus" | "row";
  /** Draw the conversation line from the tweet above into this avatar. */
  connectAbove?: boolean;
  /** Draw the conversation line from this avatar to the tweet below. */
  connectBelow?: boolean;
  /** Shown as "Replying to @username" when the parent is not right above. */
  replyingTo?: string | null;
  /** Replaces the bubble's thread link, e.g. to focus the reply box. */
  onReply?: () => void;
  onDelete?: (tweetId: string) => void;
  /** Why the last delete of this tweet failed; focuses its Delete button. */
  failure?: string | null;
  /** Extra content under the actions, e.g. a new post's Undo countdown. */
  footer?: ReactNode;
}

/**
 * One tweet (US-B01, US-B02, US-B04, US-C02), laid out like Twitter: the
 * avatar in its own column, name, handle and time on one line, the text, and
 * an action bar with the reply bubble and like heart. Content is plain text
 * that React escapes. Only the author sees Delete, which always confirms.
 */
export function TweetCard({
  connectAbove = false,
  connectBelow = false,
  failure = null,
  footer = null,
  onDelete,
  onReply,
  replyingTo = null,
  tweet,
  variant = "card",
  viewerId,
}: TweetCardProps) {
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const canDelete = onDelete !== undefined && viewerId === tweet.author.id;
  const focus = variant === "focus";

  useEffect(() => {
    if (failure !== null) {
      deleteButton.current?.focus();
    }
  }, [failure]);

  const avatar = (
    <Avatar aria-hidden="true" className="size-10">
      {tweet.author.avatarUrl === null ? null : (
        <AvatarImage alt="" src={tweet.author.avatarUrl} />
      )}
      <AvatarFallback>
        {tweet.author.displayName.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  const names = (
    // One line in rows, like Twitter: the handle gives way first, then the
    // name; the time never wraps.
    <div
      className={cn(
        // w-0 + flex-1: a definite zero basis, so the unwrapped name line
        // never widens the card (or the page) past the screen.
        "flex w-0 min-w-0 flex-1 gap-x-1 text-sm",
        focus ? "flex-col" : "items-baseline",
      )}
    >
      <span className="min-w-0 shrink truncate font-semibold text-foreground">
        {tweet.author.displayName}
      </span>
      <Link
        className="min-w-0 shrink-[3] truncate text-muted-foreground no-underline hover:underline"
        href={`/u/${tweet.author.username}`}
      >
        @{tweet.author.username}
      </Link>
      {focus ? null : (
        <>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            ·
          </span>
          <time
            className="shrink-0 text-muted-foreground"
            dateTime={tweet.createdAt}
            title={fullTimeFormat.format(new Date(tweet.createdAt))}
          >
            {compactTime(tweet.createdAt)}
          </time>
        </>
      )}
    </div>
  );

  const deleteControl = canDelete ? (
    <AlertDialog onOpenChange={setConfirming} open={confirming}>
      <AlertDialogTrigger
        aria-label="Delete tweet"
        ref={deleteButton}
        render={
          <Button
            className="-mt-1 -mr-2 size-11 shrink-0 text-muted-foreground hover:text-destructive sm:size-9"
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <Trash2Icon aria-hidden="true" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this tweet?</AlertDialogTitle>
          <AlertDialogDescription>
            This also deletes every reply below this tweet, including replies by
            other people. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={() => {
              setConfirming(false);
              onDelete(tweet.id);
            }}
            type="button"
            variant="destructive"
          >
            <Trash2Icon aria-hidden="true" data-icon="inline-start" />
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  const replying =
    replyingTo === null ? null : (
      <p className="text-sm text-muted-foreground">
        Replying to{" "}
        <Link
          className="text-sky-700 no-underline hover:underline dark:text-sky-400"
          href={`/u/${replyingTo}`}
        >
          @{replyingTo}
        </Link>
      </p>
    );

  const alert =
    failure === null ? null : (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertDescription>{failure}</AlertDescription>
      </Alert>
    );

  if (focus) {
    return (
      <article className="grid gap-3 px-4 pt-1 pb-2">
        <div className="relative flex items-start gap-3">
          {connectAbove ? (
            <span
              aria-hidden="true"
              className="absolute -top-1 left-5 h-1 w-0.5 -translate-x-1/2 bg-border"
            />
          ) : null}
          {avatar}
          {names}
          {deleteControl}
        </div>
        {replying}
        <p className="text-xl leading-snug whitespace-pre-wrap break-words">
          {tweet.content}
        </p>
        <TweetImage image={tweet.image} />
        <time
          className="text-sm text-muted-foreground"
          dateTime={tweet.createdAt}
        >
          {fullTimeFormat.format(new Date(tweet.createdAt))}
        </time>
        <div className="border-y py-1">
          <TweetActions
            inThread
            onReply={onReply}
            tweet={tweet}
            viewerId={viewerId}
          />
        </div>
        {alert}
      </article>
    );
  }

  return (
    <article
      className={cn(
        "flex gap-3 text-card-foreground",
        variant === "card"
          ? "rounded-xl border bg-card px-4 pt-3 pb-1"
          : "px-4 pt-3",
        variant === "row" && !connectBelow ? "pb-1" : undefined,
      )}
    >
      <div className="flex w-10 shrink-0 flex-col items-center">
        {connectAbove ? (
          <span aria-hidden="true" className="-mt-3 mb-1 h-2 w-0.5 bg-border" />
        ) : null}
        {avatar}
        {connectBelow ? (
          <span aria-hidden="true" className="mt-1 w-0.5 grow bg-border" />
        ) : null}
      </div>
      <div className="grid min-w-0 flex-1 gap-1 pb-1">
        <div className="flex items-start gap-2">
          {names}
          {deleteControl}
        </div>
        {replying}
        <p className="whitespace-pre-wrap break-words">{tweet.content}</p>
        <TweetImage image={tweet.image} />
        <TweetActions onReply={onReply} tweet={tweet} viewerId={viewerId} />
        {footer}
        {alert}
      </div>
    </article>
  );
}
