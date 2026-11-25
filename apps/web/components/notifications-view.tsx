"use client";

import {
  AtSignIcon,
  BellIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  HeartIcon,
  MessageCircleIcon,
  RotateCwIcon,
  UserPlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ApiError } from "../lib/api-client";
import { threadHref } from "../lib/navigation";
import {
  useMarkNotificationsRead,
  useNotifications,
  useUnreadCount,
} from "../lib/notifications";
import { compactTime } from "../lib/relative-time";
import { useSession } from "../lib/session";
import { useHydrated } from "../lib/use-hydrated";
import { cn } from "../lib/utils";

import { FollowListSkeleton } from "./skeletons";

import type { Notification } from "@twitter-clone/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const copy = {
  follow: {
    action: "followed you",
    Icon: UserPlusIcon,
    tone: "text-sky-600 dark:text-sky-400",
  },
  like: {
    action: "liked your tweet",
    Icon: HeartIcon,
    tone: "text-rose-600 dark:text-rose-400",
  },
  reply: {
    action: "replied to your tweet",
    Icon: MessageCircleIcon,
    tone: "text-sky-600 dark:text-sky-400",
  },
  mention: {
    action: "mentioned you",
    Icon: AtSignIcon,
    tone: "text-sky-600 dark:text-sky-400",
  },
} as const;

/** Where a notification leads: the follower's profile, or the tweet. */
function targetOf(notification: Notification): string {
  return notification.tweet === null
    ? `/u/${encodeURIComponent(notification.actor.username)}`
    : threadHref(notification.tweet.id);
}

function NotificationRow({
  notification,
  onOpen,
}: Readonly<{ notification: Notification; onOpen: () => void }>) {
  const { action, Icon, tone } = copy[notification.type];
  const unread = !notification.read;
  return (
    <Link
      className={cn(
        "flex gap-3 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
        unread ? "bg-sky-500/5" : undefined,
      )}
      href={targetOf(notification)}
      onClick={onOpen}
    >
      <span className={cn("flex w-8 shrink-0 justify-end pt-1", tone)}>
        <Icon
          aria-hidden="true"
          className={cn(
            "size-6",
            notification.type === "like" && "fill-current",
          )}
        />
      </span>
      <span className="grid min-w-0 flex-1 gap-1.5">
        <span className="flex items-center justify-between gap-2">
          <Avatar aria-hidden="true" className="size-8">
            <AvatarFallback>
              {notification.actor.displayName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {unread ? (
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full bg-sky-500"
            />
          ) : null}
        </span>
        <span className="text-sm">
          {unread ? <span className="sr-only">Unread. </span> : null}
          <span className="font-semibold">
            {notification.actor.displayName}
          </span>{" "}
          {action}
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            <time
              dateTime={notification.createdAt}
              title={new Date(notification.createdAt).toLocaleString()}
            >
              {compactTime(notification.createdAt)}
            </time>
          </span>
        </span>
        {notification.tweet === null ? null : (
          <span className="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground break-words">
            {notification.tweet.content}
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * The member's notifications (NOT-01): newest first with Load more. Opening
 * one marks it read; Mark all as read clears the rest. Members only; a
 * signed-out visitor is sent to /login, like home.
 */
export function NotificationsView() {
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const member = hydrated ? (session.data?.user ?? null) : null;
  const signedOut = session.isSuccess && session.data === null;

  useEffect(() => {
    if (signedOut) {
      router.replace("/login");
    }
  }, [router, signedOut]);

  if (member === null) {
    return <FollowListSkeleton count={4} label="Loading notifications…" />;
  }
  return <MemberNotifications memberId={member.id} />;
}

function MemberNotifications({ memberId }: Readonly<{ memberId: string }>) {
  const router = useRouter();
  const list = useNotifications(memberId);
  const count = useUnreadCount(memberId);
  const mark = useMarkNotificationsRead(memberId);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = count.data?.unreadCount ?? items.filter((i) => !i.read).length;

  useEffect(() => {
    if (
      list.error instanceof ApiError &&
      list.error.code === "UNAUTHENTICATED"
    ) {
      router.replace("/login");
    }
  }, [list.error, router]);

  return (
    <section aria-labelledby="notifications-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" id="notifications-heading">
          Notifications
        </h1>
        <Button
          disabled={unread === 0 || mark.isPending}
          onClick={() => mark.mutate({ all: true })}
          size="sm"
          type="button"
          variant="outline"
        >
          <CheckCheckIcon aria-hidden="true" data-icon="inline-start" />
          Mark all as read
        </Button>
      </div>

      {mark.isError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>
            We couldn&apos;t mark your notifications as read. Try again.
          </AlertDescription>
        </Alert>
      ) : null}

      {list.isPending ? (
        <FollowListSkeleton count={4} label="Loading notifications…" />
      ) : null}

      {list.isError && !list.isFetchNextPageError ? (
        <div className="grid gap-3">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>
              We couldn&apos;t load your notifications.
            </AlertDescription>
          </Alert>
          <Button
            className="justify-self-start"
            onClick={() => void list.refetch()}
            type="button"
            variant="outline"
          >
            <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : null}

      {list.isSuccess && items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No notifications yet</EmptyTitle>
            <EmptyDescription>
              When someone follows you, or likes or replies to your tweets,
              you&apos;ll see it here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {items.length > 0 ? (
        <ol
          aria-labelledby="notifications-heading"
          className="content-enter grid divide-y overflow-hidden rounded-xl border bg-card"
        >
          {items.map((notification) => (
            <li key={notification.id}>
              <NotificationRow
                notification={notification}
                onOpen={() => {
                  if (!notification.read) {
                    mark.mutate({ ids: [notification.id] });
                  }
                }}
              />
            </li>
          ))}
        </ol>
      ) : null}

      {list.isFetchNextPageError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>
            We couldn&apos;t load older notifications.
          </AlertDescription>
        </Alert>
      ) : null}

      {list.isFetchingNextPage ? (
        <FollowListSkeleton count={2} label="Loading older notifications…" />
      ) : null}

      {list.hasNextPage === true ? (
        <Button
          className="justify-self-center"
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
      ) : null}

      {list.isSuccess && list.hasNextPage !== true && items.length > 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          You&apos;re all caught up.
        </p>
      ) : null}
    </section>
  );
}
