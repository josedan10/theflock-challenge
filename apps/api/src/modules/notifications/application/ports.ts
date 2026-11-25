import type { KeysetPosition } from "../../../platform/pagination/signed-keyset-cursor.js";
import type { NotificationType } from "@twitter-clone/contracts";

/** A stored notification as the recipient sees it. */
export interface NotificationEntry {
  id: string;
  type: NotificationType;
  /** UTC at microsecond precision, text so the cursor keeps every digit. */
  createdAt: string;
  read: boolean;
  actor: { id: string; username: string; displayName: string };
  tweet: { id: string; content: string } | null;
}

export interface NotificationStore {
  /** Up to `count` notifications newest first, strictly after `before`. */
  page(
    recipientId: string,
    before: KeysetPosition | null,
    count: number,
  ): Promise<NotificationEntry[]>;
  unreadCount(recipientId: string): Promise<number>;
  /** Marks the recipient's own listed notifications read; others' ids are ignored. */
  markRead(
    recipientId: string,
    ids: readonly string[],
    now: Date,
  ): Promise<void>;
  /** Marks everything received up to `now` read. */
  markAllRead(recipientId: string, now: Date): Promise<void>;
}
