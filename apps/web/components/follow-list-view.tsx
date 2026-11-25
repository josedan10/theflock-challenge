"use client";

import {
  ArrowLeftIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  RotateCwIcon,
  UsersRoundIcon,
} from "lucide-react";
import Link from "next/link";

import { ApiError, type FollowListDirection } from "../lib/api-client";
import { useFollowList } from "../lib/follows";
import { useSession } from "../lib/session";
import { useHydrated } from "../lib/use-hydrated";

import { MemberRow } from "./member-row";
import { FollowListSkeleton } from "./skeletons";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const copy: Record<
  FollowListDirection,
  { title: string; empty: string; end: string }
> = {
  followers: {
    empty: "No followers yet.",
    end: "That's everyone who follows them.",
    title: "Followers",
  },
  following: {
    empty: "Not following anyone yet.",
    end: "That's everyone they follow.",
    title: "Following",
  },
};

/**
 * A member's followers or following (US-C03). Public: signed-out visitors see
 * the list without follow controls. Pages load with "Load more"; the cursor
 * stays in the query cache. Empty and end-of-list states are explicit
 * (AC-C03.2).
 */
export function FollowListView({
  direction,
  username,
}: Readonly<{ direction: FollowListDirection; username: string }>) {
  const list = useFollowList(username, direction);
  const session = useSession();
  const hydrated = useHydrated();
  // Follow controls depend on the session; keep the first render server-equal.
  const viewer = hydrated ? (session.data?.user ?? null) : null;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const text = copy[direction];
  const notFound =
    list.error instanceof ApiError && list.error.code === "NOT_FOUND";

  return (
    <section aria-labelledby="follow-list-heading" className="grid gap-4">
      <div className="grid gap-3">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground"
          href={`/u/${encodeURIComponent(username)}`}
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Back to @{username}
        </Link>
        <h1 className="text-2xl font-bold" id="follow-list-heading">
          {text.title}
          <span className="sr-only"> of @{username}</span>
        </h1>
        <nav aria-label="Follow lists" className="flex gap-2">
          {(["followers", "following"] as const).map((tab) => (
            <Link
              aria-current={tab === direction ? "page" : undefined}
              className={buttonVariants({
                size: "sm",
                variant: tab === direction ? "secondary" : "ghost",
              })}
              href={`/u/${encodeURIComponent(username)}/${tab}`}
              key={tab}
            >
              {copy[tab].title}
            </Link>
          ))}
        </nav>
      </div>

      {list.isPending ? <FollowListSkeleton label="Loading people…" /> : null}

      {list.isError && !list.isFetchNextPageError ? (
        <div className="grid gap-4">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>
              {notFound
                ? "That profile does not exist."
                : "We couldn't load this list."}
            </AlertDescription>
          </Alert>
          {notFound ? null : (
            <Button
              onClick={() => void list.refetch()}
              type="button"
              variant="outline"
            >
              <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
              Try again
            </Button>
          )}
        </div>
      ) : null}

      {list.isSuccess && items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRoundIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{text.empty}</EmptyTitle>
            <EmptyDescription>
              People will show up here as follows happen.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {items.length > 0 ? (
        <ul
          aria-labelledby="follow-list-heading"
          className="content-enter grid gap-2"
        >
          {items.map((item) => (
            <li key={item.user.id}>
              <MemberRow item={item} viewerUsername={viewer?.username} />
            </li>
          ))}
        </ul>
      ) : null}

      {list.isFetchNextPageError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>We couldn't load more people.</AlertDescription>
        </Alert>
      ) : null}

      {list.hasNextPage === true ? (
        <div className="grid justify-items-center gap-3">
          {list.isFetchingNextPage ? (
            <FollowListSkeleton count={2} label="Loading more people…" />
          ) : null}
          <Button
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
            type="button"
            variant="outline"
          >
            {list.isFetchNextPageError ? (
              <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
            ) : (
              <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {list.isFetchNextPageError ? "Try again" : "Load more"}
          </Button>
        </div>
      ) : null}

      {list.isSuccess && list.hasNextPage !== true && items.length > 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {text.end}
        </p>
      ) : null}
    </section>
  );
}
