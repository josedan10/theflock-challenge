"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { ApiError } from "../lib/api-client";
import { threadHref } from "../lib/navigation";
import { useApiClient, useSession } from "../lib/session";
import { THREAD_KEY, useDeleteTweet, type TweetAuthorRef } from "../lib/tweets";

import { TweetCard } from "./tweet-card";
import { TweetComposer } from "./tweet-composer";

import type { ThreadItem } from "@twitter-clone/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

function MemberCard({
  item,
  member,
  selected,
}: {
  item: ThreadItem;
  member: TweetAuthorRef;
  selected: boolean;
}) {
  const remove = useDeleteTweet(member);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <TweetCard
      tweet={item}
      viewerId={member.id}
      showThreadLink={!selected}
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
    />
  );
}

/** Public subtree reader. Opening a reply selects it as the new conversation and composer target. */
export function ThreadView({ id }: { id: string }) {
  const client = useApiClient();
  const session = useSession();
  const member = session.data?.user;
  const query = useInfiniteQuery({
    enabled: !session.isPending,
    queryKey: [...THREAD_KEY, id, member?.id ?? null],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.getThread(id, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const root = query.data?.pages[0]?.selected;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  if (root) {
    byId.set(root.id, root);
  }
  const missing =
    query.error instanceof ApiError && query.error.code === "NOT_FOUND";
  const card = (item: ThreadItem, selected = false) =>
    member ? (
      <MemberCard item={item} selected={selected} member={member} />
    ) : (
      <TweetCard tweet={item} viewerId={null} showThreadLink={!selected} />
    );
  return (
    <section className="grid gap-4" aria-labelledby="thread-heading">
      <h1 className="text-2xl font-bold" id="thread-heading">
        Thread
      </h1>
      {query.isPending ? (
        <div role="status">
          <span>Loading thread…</span>
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}
      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {missing
              ? "This tweet no longer exists."
              : "Couldn't load this thread."}
            {!missing && (
              <Button
                variant="outline"
                onClick={() =>
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage()
                    : query.refetch())
                }
              >
                Try again
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {!missing && root ? (
        <>
          {root.parentTweetId && (
            <Link
              className="w-fit underline"
              href={threadHref(root.parentTweetId)}
            >
              View parent tweet
            </Link>
          )}
          {card(root, true)}
          {member ? (
            <TweetComposer
              key={root.id}
              parentTweetId={root.id}
              member={member}
            />
          ) : (
            <Link className="w-fit underline" href="/login">
              Log in to reply
            </Link>
          )}
          <h2 className="text-lg font-semibold">Replies</h2>
          {items.length === 0 ? (
            <Empty role="status">
              <EmptyHeader>
                <EmptyTitle>No replies yet.</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ol aria-label="Replies" className="grid gap-3">
              {items.map((item) => (
                <li className="grid gap-1 border-l-2 pl-3" key={item.id}>
                  {item.parentTweetId && (
                    <Link
                      aria-label={`View parent tweet by ${byId.get(item.parentTweetId)?.author.displayName ?? "another member"}`}
                      className="grid gap-1 rounded-md border-l-2 bg-muted/40 px-3 py-2 text-sm hover:bg-muted"
                      href={threadHref(item.parentTweetId)}
                    >
                      <span className="font-medium">
                        In reply to{" "}
                        {byId.has(item.parentTweetId)
                          ? `@${byId.get(item.parentTweetId)?.author.username}`
                          : "parent tweet"}
                      </span>
                      {byId.has(item.parentTweetId) ? (
                        <span className="line-clamp-2 text-muted-foreground">
                          {byId.get(item.parentTweetId)?.content}
                        </span>
                      ) : null}
                    </Link>
                  )}
                  {card(item)}
                </li>
              ))}
            </ol>
          )}
          <p role="status">
            {query.isFetchingNextPage
              ? "Loading more replies…"
              : items.length === 0
                ? ""
                : query.hasNextPage
                  ? `${items.length} replies shown.`
                  : "End of thread."}
          </p>
          {query.hasNextPage && !query.isFetchNextPageError ? (
            <Button
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Load more replies
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
