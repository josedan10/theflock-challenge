import { describe, expect, it } from "vitest";

import { FollowTargetNotFoundError } from "../domain/errors.js";

import { createFollowMember } from "./follow-member.js";
import { createUnfollowMember } from "./unfollow-member.js";

import type {
  FollowRelationship,
  FollowRepository,
  FollowWrite,
  UnfollowWrite,
} from "./ports.js";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const LATER = new Date("2026-11-24T13:00:00.000Z");

function fakeFollows() {
  const edges = new Map<string, Date>();
  const members = new Map<string, string>([
    ["ada", "ada-id"],
    ["grace", "grace-id"],
  ]);
  const key = (followerId: string, followingId: string) =>
    `${followerId}:${followingId}`;
  const count = (followingId: string) =>
    [...edges.keys()].filter((edge) => edge.endsWith(`:${followingId}`)).length;
  const repository: FollowRepository = {
    async follow(input: FollowWrite): Promise<FollowRelationship> {
      const targetId = members.get(input.username);
      if (targetId === undefined) {
        throw new FollowTargetNotFoundError();
      }
      const edge = key(input.followerId, targetId);
      if (!edges.has(edge)) {
        edges.set(edge, input.now);
      }
      return {
        followerCount: count(targetId),
        following: true,
        targetId,
      };
    },
    async unfollow(input: UnfollowWrite): Promise<FollowRelationship> {
      const targetId = members.get(input.username);
      if (targetId === undefined) {
        throw new FollowTargetNotFoundError();
      }
      edges.delete(key(input.followerId, targetId));
      return {
        followerCount: count(targetId),
        following: false,
        targetId,
      };
    },
  };
  return { edges, repository };
}

describe("follow member", () => {
  it("US-C01 AC-C01.1 stores one edge for the session member and a canonical username", async () => {
    const { edges, repository } = fakeFollows();
    const follow = createFollowMember({
      clock: () => NOW,
      follows: repository,
    });

    const relationship = await follow({
      followerId: "ada-id",
      username: "  Grace ",
    });

    expect(relationship).toEqual({
      followerCount: 1,
      following: true,
      targetId: "grace-id",
    });
    expect(edges.get("ada-id:grace-id")).toEqual(NOW);
  });

  it("US-C01 AC-C01.2 keeps the original edge when the follow is repeated", async () => {
    const { edges, repository } = fakeFollows();
    const follow = createFollowMember({
      clock: () => NOW,
      follows: repository,
    });
    await follow({ followerId: "ada-id", username: "grace" });

    const again = await createFollowMember({
      clock: () => LATER,
      follows: repository,
    })({ followerId: "ada-id", username: "GRACE" });

    expect(again.followerCount).toBe(1);
    expect(edges.get("ada-id:grace-id")).toEqual(NOW);
  });

  it("US-C01 AC-C01.1 does not query for a username that cannot exist", async () => {
    const { repository } = fakeFollows();
    const follow = createFollowMember({
      clock: () => NOW,
      follows: repository,
    });

    await expect(
      follow({ followerId: "ada-id", username: "not a user" }),
    ).rejects.toBeInstanceOf(FollowTargetNotFoundError);
  });
});

describe("unfollow member", () => {
  it("US-C01 AC-C01.2 removes the edge once and leaves a repeat as a no-op", async () => {
    const { edges, repository } = fakeFollows();
    await createFollowMember({ clock: () => NOW, follows: repository })({
      followerId: "ada-id",
      username: "grace",
    });
    const unfollow = createUnfollowMember({ follows: repository });

    const first = await unfollow({ followerId: "ada-id", username: "Grace" });
    const second = await unfollow({ followerId: "ada-id", username: "grace" });

    expect(first).toMatchObject({ followerCount: 0, following: false });
    expect(second.followerCount).toBe(0);
    expect(edges.size).toBe(0);
  });

  it("US-C01 AC-C01.1 does not query for a username that cannot exist", async () => {
    const unfollow = createUnfollowMember({
      follows: fakeFollows().repository,
    });

    await expect(
      unfollow({ followerId: "ada-id", username: "no" }),
    ).rejects.toBeInstanceOf(FollowTargetNotFoundError);
  });
});
