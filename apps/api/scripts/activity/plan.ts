import { activityCorpus } from "../activity-corpus/corpus.js";

import type { ActivityExample } from "../activity-corpus/corpus.js";

/** A member the simulator can act as, mention, or reply to. */
export interface Member {
  id: string;
  username: string;
}

/** A recent tweet (post or reply) that can receive a simulated like or reply. */
export interface RecentPost {
  id: string;
  authorId: string;
  content: string;
}

/** What the simulator can see before one action. */
export interface World {
  /** Seeded demo accounts. The simulator only ever writes as one of these. */
  actors: Member[];
  /** Everyone who can be mentioned, real local members included. */
  members: Member[];
  recent: RecentPost[];
}

export type Random = () => number;

export type PlannedAction =
  | {
      kind: "post";
      author: Member;
      content: string;
      /** File under `activity-corpus/images/`, or null. */
      image: string | null;
    }
  | { kind: "reply"; author: Member; content: string; parentTweetId: string }
  | { kind: "like"; author: Member; tweetId: string };

/*
 * The simulator exists so real local members see activity around them. While
 * any real member exists, about 9 in 10 actions involve one: a like or reply
 * on their tweets, or a post that mentions them. Demo accounts only talk among
 * themselves when nobody real is around.
 */

/** With a real member's tweet to act on: actions below this draw are likes. */
export const REAL_LIKE_SHARE = 0.35;
/** With a real member's tweet to act on: likes plus replies; the rest are posts. */
export const REAL_LIKE_OR_REPLY_SHARE = 0.85;
/** Chance a reply goes to a real member's tweet rather than a demo account's. */
export const REAL_TARGET_SHARE = 0.9;
/** With real members around, chance a new post is a line with a mention slot. */
export const MENTION_POST_SHARE = 0.8;
/** Chance a mention names a real local member rather than another demo account. */
export const REAL_MENTION_SHARE = 0.9;
/** Share of actions that reply when no real member is around to engage. */
export const REPLY_SHARE = 0.4;
/** Chance a post whose line has no picture of its own borrows a corpus picture. */
export const PICTURE_SHARE = 0.5;

const posts = activityCorpus.filter((line) => line.kind === "post");
const mentionPosts = posts.filter((line) => line.text.includes("{mention}"));
/** The corpus pictures. They are simple scenes, so any post can carry one. */
const pictures = posts.flatMap((line) =>
  line.image === null ? [] : [line.image],
);
const replies = activityCorpus.filter((line) => line.kind === "reply");

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error("Nothing to pick.");
  }
  return item;
}

/** Matches a posted line whatever username filled its mention slot. */
function postedAs(line: ActivityExample): RegExp {
  const escaped = line.text
    .split("{mention}")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${escaped.join("@[a-z0-9_]+")}$`);
}

const patterns = new Map(posts.map((line) => [line.id, postedAs(line)]));

function fillMention(
  text: string,
  author: Member,
  realMembers: readonly Member[],
  world: World,
  random: Random,
): string {
  if (!text.includes("{mention}")) {
    return text;
  }
  const others = world.members.filter((member) => member.id !== author.id);
  const pool =
    realMembers.length > 0 && random() < REAL_MENTION_SHARE
      ? realMembers
      : others;
  const named = pick(pool, random);
  return text.replaceAll("{mention}", `@${named.username}`);
}

function replyLine(target: RecentPost, random: Random): ActivityExample {
  const source = posts.find((line) =>
    patterns.get(line.id)?.test(target.content),
  );
  const answers =
    source === undefined
      ? []
      : replies.filter((line) => line.parentId === source.id);
  return pick(answers.length > 0 ? answers : replies, random);
}

/**
 * Chooses one like, reply or post. Replies prefer the corpus answer to the
 * line being replied to; anything else, such as a real member's post, gets a
 * random corpus reply. Returns null when there is no demo account to act as.
 */
export function planAction(world: World, random: Random): PlannedAction | null {
  if (world.actors.length === 0 || world.members.length < 2) {
    return null;
  }
  const author = pick(world.actors, random);
  const actorIds = new Set(world.actors.map((actor) => actor.id));
  const realMembers = world.members.filter(
    (member) => !actorIds.has(member.id),
  );
  const targets = world.recent.filter((post) => post.authorId !== author.id);
  const realTargets = targets.filter((post) => !actorIds.has(post.authorId));

  const reply = (target: RecentPost): PlannedAction => ({
    author,
    content: fillMention(
      replyLine(target, random).text,
      author,
      realMembers,
      world,
      random,
    ),
    kind: "reply",
    parentTweetId: target.id,
  });

  const draw = random();
  if (realTargets.length > 0) {
    if (draw < REAL_LIKE_SHARE) {
      return { author, kind: "like", tweetId: pick(realTargets, random).id };
    }
    if (draw < REAL_LIKE_OR_REPLY_SHARE) {
      return reply(
        random() < REAL_TARGET_SHARE
          ? pick(realTargets, random)
          : pick(targets, random),
      );
    }
  } else if (realMembers.length === 0 && targets.length > 0) {
    if (draw < REPLY_SHARE) {
      return reply(pick(targets, random));
    }
  }
  // A real member who has not posted yet is still reached through mentions.
  const line =
    realMembers.length > 0 && random() < MENTION_POST_SHARE
      ? pick(mentionPosts, random)
      : pick(posts, random);
  const content = fillMention(line.text, author, realMembers, world, random);
  return {
    author,
    content,
    // A line keeps its own picture; any other post often borrows one.
    image:
      line.image ?? (random() < PICTURE_SHARE ? pick(pictures, random) : null),
    kind: "post",
  };
}
