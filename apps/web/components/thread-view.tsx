"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleAlertIcon,
  MessagesSquareIcon,
  RotateCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ApiError } from "../lib/api-client";
import { threadHref } from "../lib/navigation";
import { useApiClient, useSession } from "../lib/session";
import { buildConversations } from "../lib/thread-conversations";
import { THREAD_KEY, useDeleteTweet, type TweetAuthorRef } from "../lib/tweets";
import { useHydrated } from "../lib/use-hydrated";

import { TimelineSkeleton } from "./skeletons";
import { TweetCard, type TweetCardProps } from "./tweet-card";
import { TweetComposer } from "./tweet-composer";

import type { ThreadItem, ThreadPage } from "@twitter-clone/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type CardLayout = Omit<
  TweetCardProps,
  "failure" | "onDelete" | "tweet" | "viewerId"
>;

/** A card the signed-in author can delete, reporting a failed delete on it. */
function MemberCard({
  item,
  layout,
  member,
}: Readonly<{ item: ThreadItem; layout: CardLayout; member: TweetAuthorRef }>) {
  const remove = useDeleteTweet(member);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <TweetCard
      {...layout}
      failure={failure}
      onDelete={(id) => {
        setFailure(null);
        remove.mutate(id, {
          onError: (error) => {
            if (!(error instanceof ApiError && error.code === "NOT_FOUND")) {
              setFailure("Couldn't delete this tweet. Try again.");
            }
          },
        });
      }}
      tweet={item}
      viewerId={member.id}
    />
  );
}

/**
 * The tweet being replied to, above the selected one and joined to it by the
 * conversation line. Earlier tweets are one link away.
 */
function ParentContext({
  card,
  parentId,
  viewerId,
}: Readonly<{
  card: (item: ThreadItem, layout: CardLayout) => React.ReactNode;
  parentId: string;
  viewerId: string | null;
}>) {
  const client = useApiClient();
  const parent = useQuery({
    queryFn: () => client.getThread(parentId),
    queryKey: [...THREAD_KEY, "parent", parentId, viewerId],
  });
  if (parent.isPending) {
    return <TimelineSkeleton count={1} label="Loading the tweet above…" />;
  }
  if (parent.isError) {
    return (
      <Link
        className="w-fit px-4 text-sm text-sky-700 dark:text-sky-400"
        href={threadHref(parentId)}
      >
        View parent tweet
      </Link>
    );
  }
  const tweet = parent.data.selected;
  return (
    <div className="grid">
      {tweet.parentTweetId === null ? null : (
        <Link
          className="w-fit px-4 pb-1 text-sm text-sky-700 no-underline hover:underline dark:text-sky-400"
          href={threadHref(tweet.parentTweetId)}
        >
          Show earlier replies
        </Link>
      )}
      {card(tweet, { connectBelow: true, variant: "row" })}
    </div>
  );
}

/**
 * A tweet's thread, laid out like Twitter (US-B04): the tweet it replies to
 * above, the selected tweet in focus with its reply box, then the replies as
 * conversations, each a direct reply followed by the back-and-forth under it,
 * joined by a line. Public; signed-out readers are invited to log in.
 */
export function ThreadView({ id }: Readonly<{ id: string }>) {
  const client = useApiClient();
  const session = useSession();
  const hydrated = useHydrated();
  const member = hydrated ? (session.data?.user ?? undefined) : undefined;
  const query = useInfiniteQuery({
    enabled: !session.isPending,
    getNextPageParam: (page: ThreadPage) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.getThread(id, pageParam),
    queryKey: [...THREAD_KEY, id, member?.id ?? null],
  });
  const root = query.data?.pages[0]?.selected;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const missing =
    query.error instanceof ApiError && query.error.code === "NOT_FOUND";

  const card = (item: ThreadItem, layout: CardLayout) =>
    member ? (
      <MemberCard item={item} layout={layout} member={member} />
    ) : (
      <TweetCard {...layout} tweet={item} viewerId={null} />
    );

  const focusReplyBox = () => {
    document.getElementById("tweet-content")?.focus();
  };

  return (
    <section aria-labelledby="thread-heading" className="grid gap-2">
      <h1 className="px-4 text-xl font-bold" id="thread-heading">
        Thread
      </h1>

      {query.isPending ? <TimelineSkeleton label="Loading thread…" /> : null}

      {query.isError && !query.isFetchNextPageError ? (
        <div className="grid gap-3 px-4">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>
              {missing
                ? "This tweet no longer exists."
                : "Couldn't load this thread."}
            </AlertDescription>
          </Alert>
          {missing ? (
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/home"
            >
              Go home
            </Link>
          ) : (
            <Button
              className="justify-self-start"
              onClick={() => void query.refetch()}
              type="button"
              variant="outline"
            >
              <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
              Try again
            </Button>
          )}
        </div>
      ) : null}

      {!missing && root ? (
        <div className="content-enter grid overflow-hidden rounded-xl border bg-card text-card-foreground">
          <div className="grid pt-3">
            {root.parentTweetId === null ? null : (
              <ParentContext
                card={card}
                parentId={root.parentTweetId}
                viewerId={member?.id ?? null}
              />
            )}
            {card(root, {
              connectAbove: root.parentTweetId !== null,
              ...(member ? { onReply: focusReplyBox } : {}),
              variant: "focus",
            })}
          </div>

          <div className="border-b px-4 pb-4">
            {member ? (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">
                  Replying to{" "}
                  <span className="text-sky-700 dark:text-sky-400">
                    @{root.author.username}
                  </span>
                </p>
                <TweetComposer
                  key={root.id}
                  member={member}
                  parentTweetId={root.id}
                />
              </div>
            ) : (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href="/login"
              >
                Log in to reply
              </Link>
            )}
          </div>

          <h2 className="sr-only">Replies</h2>
          {items.length === 0 && query.isSuccess ? (
            <Empty className="py-8" role="status">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquareIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No replies yet.</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : null}

          {items.length > 0 ? (
            <ol aria-label="Replies" className="grid divide-y">
              {buildConversations(root, items).map((conversation) => (
                <li className="grid pb-1" key={conversation[0]?.item.id}>
                  {conversation.map((entry) => (
                    <div key={entry.item.id}>
                      {card(entry.item, {
                        connectAbove: entry.connectAbove,
                        connectBelow: entry.connectBelow,
                        replyingTo: entry.replyingTo,
                        variant: "row",
                      })}
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          ) : null}

          {query.isFetchNextPageError ? (
            <div className="grid gap-3 border-t p-4">
              <Alert variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertDescription>
                  Couldn&apos;t load this thread.
                </AlertDescription>
              </Alert>
              <Button
                className="justify-self-start"
                onClick={() => void query.fetchNextPage()}
                type="button"
                variant="outline"
              >
                <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
                Try again
              </Button>
            </div>
          ) : null}

          {query.isFetchingNextPage ? (
            <TimelineSkeleton count={1} label="Loading more replies…" />
          ) : null}

          {query.hasNextPage && !query.isFetchNextPageError ? (
            <div className="grid justify-items-center border-t p-3">
              <Button
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                type="button"
                variant="ghost"
              >
                <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
                Load more replies
              </Button>
            </div>
          ) : null}

          <p className="sr-only" role="status">
            {items.length > 0 && query.isSuccess && !query.hasNextPage
              ? "End of thread."
              : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}
