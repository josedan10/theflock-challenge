import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { notifications, users } from "../../../platform/database/schema.js";
import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";
import { createDrizzleTweetRepository } from "../../tweets/infrastructure/drizzle-tweet-repository.js";

import {
  createDrizzleNotificationStore,
  notificationPageQuery,
} from "./drizzle-notification-store.js";
import { recordNotification } from "./record-notification.js";

import type { StoredUser } from "../../auth/application/ports.js";
import type { NotificationEntry } from "../application/ports.js";

let database: TestDatabase;
let ada: StoredUser;
let grace: StoredUser;
let linus: StoredUser;
let tweet: string;

beforeAll(async () => {
  database = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

const store = () => createDrizzleNotificationStore(database.db);
const at = (second: number) => new Date(FIXED_NOW.getTime() + second * 1_000);

beforeEach(async () => {
  await database.reset();
  const members = createDrizzleUserRepository(database.db);
  ada = await members.create(buildNewUser({ username: "ada" }));
  grace = await members.create(buildNewUser({ username: "grace" }));
  linus = await members.create(buildNewUser({ username: "linus" }));
  tweet = (
    await createDrizzleTweetRepository(database.db).create({
      authorId: ada.id,
      content: "Ada's tweet",
      id: uuidv7(),
      now: FIXED_NOW,
    })
  ).id;
  await recordNotification(
    database.db,
    { actorId: grace.id, recipientId: ada.id, type: "follow" },
    at(1),
  );
  await recordNotification(
    database.db,
    { actorId: grace.id, recipientId: ada.id, tweetId: tweet, type: "like" },
    at(2),
  );
  await recordNotification(
    database.db,
    { actorId: linus.id, recipientId: ada.id, tweetId: tweet, type: "like" },
    at(2),
  );
  await recordNotification(
    database.db,
    { actorId: ada.id, recipientId: grace.id, type: "follow" },
    at(3),
  );
});

async function readAll(pageSize: number): Promise<NotificationEntry[]> {
  const seen: NotificationEntry[] = [];
  let before: { createdAt: string; id: string } | null = null;
  for (;;) {
    const rows = await store().page(ada.id, before, pageSize);
    seen.push(...rows);
    const last = rows.at(-1);
    if (rows.length < pageSize || last === undefined) {
      return seen;
    }
    before = { createdAt: last.createdAt, id: last.id };
  }
}

describe("notification store", () => {
  it("NOT-01 lists only the recipient's notifications, newest first, once each", async () => {
    for (const size of [1, 2, 10]) {
      const all = await readAll(size);
      expect(all.map((row) => `${row.type}:${row.actor.username}`)).toEqual([
        expect.stringMatching(/^like:(grace|linus)$/),
        expect.stringMatching(/^like:(grace|linus)$/),
        "follow:grace",
      ]);
      expect(new Set(all.map((row) => row.id)).size).toBe(3);
    }
    const [like] = await readAll(10);
    expect(like?.tweet).toEqual({ content: "Ada's tweet", id: tweet });
    expect(like?.read).toBe(false);
  });

  it("NOT-01 counts unread per member and marks only the member's own ids", async () => {
    await expect(store().unreadCount(ada.id)).resolves.toBe(3);
    const [first] = await readAll(1);
    const [graces] = await database.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.recipientId, grace.id));

    await store().markRead(ada.id, [first?.id ?? "", graces?.id ?? ""], at(9));

    await expect(store().unreadCount(ada.id)).resolves.toBe(2);
    await expect(store().unreadCount(grace.id)).resolves.toBe(1);
    expect((await readAll(10))[0]?.read).toBe(true);
  });

  it("NOT-01 marks everything received so far, not later arrivals", async () => {
    await store().markAllRead(ada.id, at(2));
    await recordNotification(
      database.db,
      { actorId: linus.id, recipientId: ada.id, type: "follow" },
      at(5),
    );

    await expect(store().unreadCount(ada.id)).resolves.toBe(1);
    await expect(store().unreadCount(grace.id)).resolves.toBe(1);
  });

  it("NOT-01 hides notifications from soft-deleted actors", async () => {
    await database.db
      .update(users)
      .set({ deletedAt: FIXED_NOW })
      .where(eq(users.id, linus.id));

    expect((await readAll(10)).map((row) => row.actor.username)).not.toContain(
      "linus",
    );
    await expect(store().unreadCount(ada.id)).resolves.toBe(2);
  });

  it("NOT-01 reads a page through the recipient index", async () => {
    const plan = await database.db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute<{ "QUERY PLAN": string }>(
        sql`explain ${notificationPageQuery(ada.id, null, 20)}`,
      );
    });

    expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
      "notifications_recipient_created_id_idx",
    );
  });
});
