import Link from "next/link";

import { FollowButton } from "./follow-button";

import type { FollowListItem } from "@twitter-clone/contracts";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";

/**
 * One member in a follow list or in search results: avatar, name, a link to
 * the profile, and Follow or Unfollow for a signed-in viewer on anyone but
 * themselves.
 */
export function MemberRow({
  item,
  viewerUsername,
}: Readonly<{ item: FollowListItem; viewerUsername: string | undefined }>) {
  const { user } = item;
  return (
    <Item variant="outline">
      <ItemMedia>
        <Avatar aria-hidden="true">
          <AvatarFallback>
            {user.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">
          {user.displayName}
          {item.isViewer ? (
            <span className="text-muted-foreground"> (you)</span>
          ) : null}
        </ItemTitle>
        <ItemDescription>
          <Link href={`/u/${encodeURIComponent(user.username)}`}>
            @{user.username}
          </Link>
        </ItemDescription>
      </ItemContent>
      {viewerUsername === undefined || item.isViewer ? null : (
        <ItemActions>
          <FollowButton
            following={item.followedByViewer}
            username={user.username}
            viewerUsername={viewerUsername}
          />
        </ItemActions>
      )}
    </Item>
  );
}
