import { describe, expect, it } from "vitest";

import { activityCorpus } from "../activity-corpus/corpus.js";

import { planAction, type Random, type World } from "./plan.js";

const demo1 = { id: "d1", username: "demo_1" };
const demo2 = { id: "d2", username: "demo_2" };
const demo3 = { id: "d3", username: "demo_3" };
const grace = { id: "r1", username: "grace" };
const alan = { id: "r2", username: "alan" };

/** Replays fixed draws so each branch is deterministic. */
function draws(...values: number[]): Random {
  let index = 0;
  return () => values[index++] ?? 0;
}

/** Small seeded generator for the statistical check. */
function seeded(seed: number): Random {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function line(id: string) {
  const found = activityCorpus.find((example) => example.id === id);
  if (found === undefined) {
    throw new Error(`Missing corpus line ${id}`);
  }
  return found;
}

const demosOnly: World = {
  actors: [demo1, demo2],
  members: [demo1, demo2],
  recent: [],
};
const withGrace: World = {
  actors: [demo1, demo2],
  members: [demo1, demo2, grace],
  recent: [],
};
const mine = { authorId: demo1.id, content: "Mine", id: "m1" };
const demoPost = { authorId: demo2.id, content: "From demo_2", id: "d2p" };
const theirs = { authorId: grace.id, content: "Hello world", id: "g1" };

describe("DEV-01 activity plan", () => {
  it("does nothing without demo accounts to act as", () => {
    expect(planAction({ ...demosOnly, actors: [] }, draws(0))).toBeNull();
  });

  describe("with nobody real around", () => {
    it("posts corpus lines, pictures included", () => {
      expect(planAction(demosOnly, draws(0, 0.9, 0))).toEqual({
        author: demo1,
        content: line("post-001").text,
        image: "scene-01.png",
        kind: "post",
      });
    });

    it("replies among demo accounts with the corpus answer, and never likes", () => {
      const posted = {
        authorId: demo2.id,
        content:
          "Saving a seat for @demo_1 if this train ever decides to move.",
        id: "t1",
      };
      const action = planAction(
        { ...demosOnly, recent: [posted] },
        draws(0, 0.1, 0, 0, 0, 0),
      );
      expect(action).toMatchObject({ kind: "reply", parentTweetId: "t1" });
      const answers = activityCorpus
        .filter((example) => example.parentId === "post-031")
        .map((example) => example.text.replace("{mention}", "@demo_2"));
      expect(answers).toContain(
        action?.kind === "reply" ? action.content : null,
      );
    });
  });

  describe("with real members", () => {
    it("mentions a real member who has not posted yet", () => {
      expect(planAction(withGrace, draws(0, 0.5, 0, 0, 0, 0))).toMatchObject({
        content: "Saving a seat for @grace if this train ever decides to move.",
        kind: "post",
      });
    });

    it("sometimes names another demo account, never the author", () => {
      // The 0.95 draw skips the real-member pool; demo_2 is the first other account.
      expect(planAction(withGrace, draws(0, 0.5, 0, 0, 0.95, 0))).toMatchObject(
        {
          content:
            "Saving a seat for @demo_2 if this train ever decides to move.",
        },
      );
    });

    it("likes a real member's tweet", () => {
      expect(
        planAction({ ...withGrace, recent: [mine, theirs] }, draws(0, 0.1, 0)),
      ).toEqual({ author: demo1, kind: "like", tweetId: "g1" });
    });

    it("replies to a real member's tweet and skips the author's own", () => {
      expect(
        planAction(
          { ...withGrace, recent: [mine, demoPost, theirs] },
          draws(0, 0.5, 0, 0, 0, 0, 0),
        ),
      ).toMatchObject({ author: demo1, kind: "reply", parentTweetId: "g1" });
    });

    it("involves a real member in about 9 of 10 actions", () => {
      const world: World = {
        actors: [demo1, demo2, demo3],
        members: [demo1, demo2, demo3, grace, alan],
        recent: [
          theirs,
          { authorId: alan.id, content: "Morning all", id: "a1" },
          demoPost,
          { authorId: demo3.id, content: "From demo_3", id: "d3p" },
        ],
      };
      const realTweets = new Set(["g1", "a1"]);
      const random = seeded(42);
      const runs = 2000;
      let involved = 0;
      for (let run = 0; run < runs; run += 1) {
        const action = planAction(world, random);
        if (action === null) {
          continue;
        }
        const target =
          action.kind === "like"
            ? action.tweetId
            : action.kind === "reply"
              ? action.parentTweetId
              : null;
        const named =
          action.kind !== "like" && /@(grace|alan)\b/.test(action.content);
        if ((target !== null && realTweets.has(target)) || named) {
          involved += 1;
        }
      }
      expect(involved / runs).toBeGreaterThan(0.85);
    });
  });
});
