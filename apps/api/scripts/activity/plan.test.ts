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
      parentTweetId: null,
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
    expect(action?.parentTweetId).toBe("t1");
    const answers = activityCorpus.filter(
      (example) => example.parentId === "post-031",
    );
    expect(
      answers.map((example) => example.text.replace("{mention}", "@grace")),
    ).toContain(action?.content);
    expect(action?.image).toBeNull();
  });

  it("replies to a real member's own post and skips the author's posts", () => {
    const mine = { authorId: demo1.id, content: "Mine", id: "m1" };
    const theirs = { authorId: grace.id, content: "Hello world", id: "g1" };
    const action = planAction(
      { ...world, recent: [mine, theirs] },
      draws(0, 0, 0),
    );
    expect(action?.author).toEqual(demo1);
    expect(action?.parentTweetId).toBe("g1");
  });
});
