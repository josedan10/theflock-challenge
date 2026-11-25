import { describe, expect, it } from "vitest";

import { activityCorpus } from "../activity-corpus/corpus.js";

import { planAction, type Random, type World } from "./plan.js";

const demo1 = { id: "d1", username: "demo_1" };
const demo2 = { id: "d2", username: "demo_2" };
const grace = { id: "r1", username: "grace" };

/** Replays fixed draws so each branch is deterministic. */
function draws(...values: number[]): Random {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

function line(id: string) {
  const found = activityCorpus.find((example) => example.id === id);
  if (found === undefined) {
    throw new Error(`Missing corpus line ${id}`);
  }
  return found;
}

const world: World = {
  actors: [demo1, demo2],
  members: [demo1, demo2, grace],
  recent: [],
};

describe("DEV-01 activity plan", () => {
  it("does nothing without demo accounts to act as", () => {
    expect(planAction({ ...world, actors: [] }, draws(0))).toBeNull();
  });

  it("posts the first corpus line with its picture as a demo account", () => {
    expect(planAction(world, draws(0))).toEqual({
      author: demo1,
      content: line("post-001").text,
      image: "scene-01.png",
      kind: "post",
    });
  });

  it("fills the mention slot with a real member, never the author", () => {
    const slot = activityCorpus.findIndex((example) =>
      example.text.startsWith("Saving a seat for {mention}"),
    );
    // author demo_1, corpus index `slot`, real pool, first real member.
    const action = planAction(world, draws(0, (slot + 0.5) / 120, 0, 0));
    expect(action?.content).toBe(
      "Saving a seat for @grace if this train ever decides to move.",
    );
  });

  it("can mention another demo account but never the author", () => {
    const slot = activityCorpus.findIndex((example) =>
      example.text.startsWith("Saving a seat for {mention}"),
    );
    const action = planAction(world, draws(0, (slot + 0.5) / 120, 0.9, 0));
    expect(action?.content).toBe(
      "Saving a seat for @demo_2 if this train ever decides to move.",
    );
  });

  it("answers a posted corpus line with one of its own replies", () => {
    const posted = {
      authorId: demo2.id,
      content: "Saving a seat for @grace if this train ever decides to move.",
      id: "t1",
    };
    const action = planAction({ ...world, recent: [posted] }, draws(0));
    expect(action).toMatchObject({ kind: "reply", parentTweetId: "t1" });
    const answers = activityCorpus.filter(
      (example) => example.parentId === "post-031",
    );
    expect(
      answers.map((example) => example.text.replace("{mention}", "@grace")),
    ).toContain(action?.kind === "reply" ? action.content : null);
  });

  describe("leaning toward real members", () => {
    const mine = { authorId: demo1.id, content: "Mine", id: "m1" };
    const demoPost = { authorId: demo2.id, content: "From demo_2", id: "d2p" };
    const theirs = { authorId: grace.id, content: "Hello world", id: "g1" };

    it("likes a real member's tweet", () => {
      expect(
        planAction({ ...world, recent: [mine, theirs] }, draws(0, 0, 0)),
      ).toEqual({ author: demo1, kind: "like", tweetId: "g1" });
    });

    it("replies to a real member's tweet and skips the author's own", () => {
      // demo_1, no like, reply, real target, first real tweet.
      const action = planAction(
        { ...world, recent: [mine, demoPost, theirs] },
        draws(0, 0.5, 0, 0, 0, 0),
      );
      expect(action).toMatchObject({
        author: demo1,
        kind: "reply",
        parentTweetId: "g1",
      });
    });

    it("replies more often when a real member has posted", () => {
      // The same 0.5 draw posts among demo accounts only, but replies to grace.
      expect(
        planAction({ ...world, recent: [demoPost] }, draws(0, 0.5, 0, 0))?.kind,
      ).toBe("post");
      expect(
        planAction({ ...world, recent: [demoPost, theirs] }, draws(0, 0.5, 0.5))
          ?.kind,
      ).toBe("reply");
    });

    it("never likes when only demo accounts have posted", () => {
      expect(
        planAction({ ...world, recent: [demoPost] }, draws(0, 0, 0))?.kind,
      ).toBe("reply");
    });
  });
});
