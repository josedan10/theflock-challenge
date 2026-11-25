"use client";

import { UserMinusIcon, UserPlusIcon } from "lucide-react";

import { useFollowMember } from "../lib/follows";

import { Button } from "@/components/ui/button";

/**
 * Follow toggle for one listed member (US-C01). The cached row flips at once
 * and flips back on failure (AC-C01.4); the error is announced next to it.
 * The visible label stays short; the accessible name starts with it and adds
 * the username, so each button in a list has a distinct name.
 */
export function FollowButton({
  following,
  username,
  viewerUsername,
}: Readonly<{
  following: boolean;
  username: string;
  viewerUsername: string;
}>) {
  const mutation = useFollowMember({ username, viewerUsername });
  const label = following ? "Unfollow" : "Follow";

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        aria-busy={mutation.isPending}
        aria-label={`${label} @${username}`}
        className="min-h-11 min-w-24"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(!following)}
        size="sm"
        type="button"
        variant={following ? "outline" : "default"}
      >
        {following ? (
          <UserMinusIcon aria-hidden="true" data-icon="inline-start" />
        ) : (
          <UserPlusIcon aria-hidden="true" data-icon="inline-start" />
        )}
        {label}
      </Button>
      <p className="text-xs text-destructive" role="status">
        {/* After a rollback `following` is the state before the click again. */}
        {mutation.isError
          ? `Couldn't ${following ? "unfollow" : "follow"}. Try again.`
          : ""}
      </p>
    </div>
  );
}
