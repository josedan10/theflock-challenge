import { activityCorpus } from "../activity-corpus/corpus.js";

import type { ActivityExample } from "../activity-corpus/corpus.js";

/** A member the simulator can act as, mention, or reply to. */
export interface Member {
  id: string;
  username: string;
}

/** A recent top-level post that can receive a simulated reply. */
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

export interface PlannedAction {
  author: Member;
  content: string;
  /** File under `activity-corpus/images/`, or null. */
  image: string | null;
  /** Set for a reply. */
  parentTweetId: string | null;
}

/** Share of actions that reply instead of posting, when there is something to reply to. */
export const REPLY_SHARE = 0.4;

/** Chance a mention names a real local member rather than another demo account. */
export const REAL_MENTION_SHARE = 0.5;

const posts = activityCorpus.filter((line) => line.kind === "post");
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
  world: World,
  random: Random,
): string {
  if (!text.includes("{mention}")) {
    return text;
  }
  const actorIds = new Set(world.actors.map((actor) => actor.id));
  const others = world.members.filter((member) => member.id !== author.id);
  const real = others.filter((member) => !actorIds.has(member.id));
  const pool = real.length > 0 && random() < REAL_MENTION_SHARE ? real : others;
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
 * Chooses one post or reply. Replies prefer the corpus answer to the line
 * being replied to; anything else, such as a real member's post, gets a
 * random corpus reply. Returns null when there is no demo account to act as.
 */
export function planAction(world: World, random: Random): PlannedAction | null {
  if (world.actors.length === 0 || world.members.length < 2) {
    return null;
  }
  const author = pick(world.actors, random);
  const targets = world.recent.filter((post) => post.authorId !== author.id);
  if (targets.length > 0 && random() < REPLY_SHARE) {
    const target = pick(targets, random);
    const line = replyLine(target, random);
    return {
      author,
      content: fillMention(line.text, author, world, random),
      image: null,
      parentTweetId: target.id,
    };
  }
  const line = pick(posts, random);
  return {
    author,
    content: fillMention(line.text, author, world, random),
    image: line.image,
    parentTweetId: null,
  };
}
