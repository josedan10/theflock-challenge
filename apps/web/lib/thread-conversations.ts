import type { ThreadItem } from "@twitter-clone/contracts";

/** One reply placed in a conversation, with how it joins its neighbours. */
export interface ConversationEntry {
  item: ThreadItem;
  /** The tweet right above is this reply's parent: draw the line in. */
  connectAbove: boolean;
  /** The tweet right below replies to this one: draw the line out. */
  connectBelow: boolean;
  /** Parent's username when the parent is not the tweet right above. */
  replyingTo: string | null;
}

/**
 * Groups a thread's replies like Twitter: each direct reply to the selected
 * tweet starts a conversation, followed by its own replies depth-first, so a
 * back-and-forth reads top to bottom joined by a line. A reply whose parent
 * is not directly above names it ("Replying to @x").
 *
 * `items` are the loaded descendants, oldest first. A reply whose parent is
 * not loaded (on a later page) starts its own conversation.
 */
export function buildConversations(
  selected: ThreadItem,
  items: readonly ThreadItem[],
): ConversationEntry[][] {
  const byId = new Map<string, ThreadItem>([[selected.id, selected]]);
  for (const item of items) {
    byId.set(item.id, item);
  }
  const children = new Map<string, ThreadItem[]>();
  const starts: ThreadItem[] = [];
  for (const item of items) {
    const parent = item.parentTweetId;
    if (parent === null || parent === selected.id || !byId.has(parent)) {
      starts.push(item);
    } else {
      const siblings = children.get(parent) ?? [];
      siblings.push(item);
      children.set(parent, siblings);
    }
  }

  const walk = (item: ThreadItem, into: ThreadItem[]) => {
    into.push(item);
    for (const child of children.get(item.id) ?? []) {
      walk(child, into);
    }
  };

  return starts.map((start) => {
    const ordered: ThreadItem[] = [];
    walk(start, ordered);
    return ordered.map((item, index) => {
      const above = ordered[index - 1];
      const below = ordered[index + 1];
      const connectAbove =
        above !== undefined && item.parentTweetId === above.id;
      const parent =
        item.parentTweetId === null ? undefined : byId.get(item.parentTweetId);
      const repliesToSelected = item.parentTweetId === selected.id;
      return {
        connectAbove,
        connectBelow: below !== undefined && below.parentTweetId === item.id,
        item,
        replyingTo:
          connectAbove || (index === 0 && repliesToSelected)
            ? null
            : (parent?.author.username ?? null),
      };
    });
  });
}
