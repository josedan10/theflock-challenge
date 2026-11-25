import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildNewUser, FIXED_NOW } from "../../../tests/auth-factories.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../../../tests/postgres.js";
import { users } from "../../auth/infrastructure/auth.schema.js";
import { createDrizzleUserRepository } from "../../auth/infrastructure/drizzle-user-repository.js";

import { createDrizzleFollowListReader } from "./drizzle-follow-list.js";
import { follows } from "./social.schema.js";

import type { StoredUser } from "../../auth/application/ports.js";
import type {
  FollowListDirection,
  FollowListEntry,
  FollowListReader,
} from "../application/ports.js";

let database: TestDatabase;
let reader: FollowListReader;
let grace: StoredUser;
let fans: StoredUser[];

beforeAll(async () => {
  database = await startTestDatabase();
  reader = createDrizzleFollowListReader(database.db);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

const at = (seconds: number, micros = 0) =>
  `2026-11-24T12:00:${String(seconds).padStart(2, "0")}.${String(micros).padStart(6, "0")}Z`;

beforeEach(async () => {
  await database.reset();
  const members = createDrizzleUserRepository(database.db);
  grace = await members.create(buildNewUser({ username: "grace" }));
  fans = [];
  for (let index = 0; index < 5; index += 1) {
    fans.push(await members.create(buildNewUser()));
  }
  // Two fans share one instant, to the microsecond, to exercise the tie-breaker.
  const times = [at(1), at(2, 500), at(2, 500), at(3, 1), at(4)];
  await database.db.execute(
    // Raw insert keeps microsecond precision that a JavaScript Date would drop.
    sqlInsertFollows(
      fans.map((fan, index) => ({
        createdAt: times[index] ?? at(0),
        followerId: fan.id,
        followingId: grace.id,
      })),
    ),
  );
});

function sqlInsertFollows(
  rows: { createdAt: string; followerId: string; followingId: string }[],
) {
  const values = rows.map(
    (row) =>
      sql`(${row.followerId}::uuid, ${row.followingId}::uuid, ${row.createdAt}::timestamptz)`,
  );
  return sql`insert into follows (follower_id, following_id, created_at) values ${sql.join(values, sql`, `)}`;
}

async function readAll(
  direction: FollowListDirection,
  memberId: string,
  viewerId: string | null,
  pageSize: number,
): Promise<FollowListEntry[]> {
  const seen: FollowListEntry[] = [];
  let before: { createdAt: string; id: string } | null = null;
  for (;;) {
    const rows = await reader.readPage({
      before,
      count: pageSize,
      direction,
      memberId,
      viewerId,
    });
    seen.push(...rows);
    const last = rows.at(-1);
    if (rows.length < pageSize || last === undefined) {
      return seen;
    }
    before = { createdAt: last.createdAt, id: last.id };
  }
}

describe("follow list persistence", () => {
  it("US-C03 AC-C03.1 lists followers newest first, once each, across pages", async () => {
    const expected = [
      fans[4],
      fans[3],
      ...[fans[1], fans[2]].sort((a, b) =>
        (a?.id ?? "").localeCompare(b?.id ?? ""),
      ),
      fans[0],
    ].map((fan) => fan?.id);

    for (const pageSize of [1, 2, 3, 10]) {
      const listed = await readAll("followers", grace.id, null, pageSize);
      expect(listed.map((entry) => entry.id)).toEqual(expected);
    }
    const [newest] = await readAll("followers", grace.id, null, 1);
    expect(newest?.createdAt).toBe(at(4));
  });

  it("US-C03 AC-C03.1 lists who a member follows from the other side of the edge", async () => {
    const fan = fans[0];
    if (fan === undefined) {
      throw new Error("missing fan");
    }

    const following = await readAll("following", fan.id, null, 10);

    expect(following).toEqual([
      {
        createdAt: at(1),
        displayName: grace.displayName,
        followedByViewer: false,
        id: grace.id,
        username: "grace",
      },
    ]);
  });

  it("US-C03 AC-C03.1 reports whether the viewer follows each listed member", async () => {
    const [viewer, followed] = fans;
    if (viewer === undefined || followed === undefined) {
      throw new Error("missing fans");
    }
    await database.db.insert(follows).values({
      createdAt: FIXED_NOW,
      followerId: viewer.id,
      followingId: followed.id,
    });

    const listed = await readAll("followers", grace.id, viewer.id, 10);

    expect(
      listed.filter((entry) => entry.followedByViewer).map((entry) => entry.id),
    ).toEqual([followed.id]);
  });

  it("US-C03 skips soft-deleted members", async () => {
    const gone = fans[4];
    if (gone === undefined) {
      throw new Error("missing fan");
    }
    await database.db
      .update(users)
      .set({ deletedAt: FIXED_NOW })
      .where(eq(users.id, gone.id));

    const listed = await readAll("followers", grace.id, null, 10);

    expect(listed.map((entry) => entry.id)).not.toContain(gone.id);
    expect(listed).toHaveLength(4);
    await expect(reader.findMemberId(gone.username)).resolves.toBeNull();
  });

  it("US-C03 AC-C03.2 returns nothing for a member without edges", async () => {
    await expect(readAll("following", grace.id, null, 10)).resolves.toEqual([]);
    await expect(reader.findMemberId("grace")).resolves.toBe(grace.id);
    await expect(reader.findMemberId("nobody")).resolves.toBeNull();
  });
});
