"use client";

import { CircleAlertIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { threadHref } from "../lib/navigation";

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

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export interface TweetCardProps {
  tweet: Tweet;
  /** The signed-in member's id, or `null` when signed out. */
  viewerId: string | null;
  showThreadLink?: boolean;
  /** Number of replies returned by the API for this tweet. */
  replyCount?: number;
  onDelete?: (tweetId: string) => void;
  /** Why the last delete of this tweet failed; focuses its Delete button. */
  failure?: string | null;
}

/**
 * One tweet (US-B01, US-B02). Content is plain text that React escapes. Only
 * the author sees Delete, and it always asks for confirmation (AC-B02.3).
 */
export function TweetCard({
  failure = null,
  showThreadLink = true,
  replyCount,
  onDelete,
  tweet,
  viewerId,
}: TweetCardProps) {
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const canDelete = onDelete !== undefined && viewerId === tweet.author.id;

  useEffect(() => {
    if (failure !== null) {
      deleteButton.current?.focus();
    }
  }, [failure]);

  return (
    <article className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground">
      <header className="flex items-start gap-3">
        <Avatar aria-hidden="true">
          {tweet.author.avatarUrl === null ? null : (
            <AvatarImage alt="" src={tweet.author.avatarUrl} />
          )}
          <AvatarFallback>
            {tweet.author.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="truncate font-semibold">{tweet.author.displayName}</p>
          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            <Link href={`/u/${tweet.author.username}`}>
              @{tweet.author.username}
            </Link>
            <time dateTime={tweet.createdAt}>
              {timeFormat.format(new Date(tweet.createdAt))}
            </time>
          </p>
        </div>
        {canDelete ? (
          <AlertDialog onOpenChange={setConfirming} open={confirming}>
            <AlertDialogTrigger
              aria-label="Delete tweet"
              ref={deleteButton}
              render={
                <Button
                  className="size-11 text-muted-foreground hover:text-destructive sm:size-9"
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
                  This also deletes every reply below this tweet, including
                  replies by other people. This can&apos;t be undone.
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
        ) : null}
      </header>
      <p className="whitespace-pre-wrap break-words">{tweet.content}</p>
      {showThreadLink ? (
        <Link className="w-fit text-sm underline" href={threadHref(tweet.id)}>
          {replyCount === undefined
            ? "Open thread"
            : replyCount === 0
              ? "Reply"
              : `${replyCount} ${replyCount === 1 ? "reply" : "replies"} · Open thread`}
          <span className="sr-only">
            {" "}
            for @{tweet.author.username}&apos;s tweet
          </span>
        </Link>
      ) : null}
      {failure === null ? null : (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
    </article>
  );
}
