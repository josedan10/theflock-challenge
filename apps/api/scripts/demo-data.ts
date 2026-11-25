import { v5 as uuid, v7 as uuidv7 } from "uuid";

import { notificationDedupeKey } from "../src/modules/notifications/infrastructure/record-notification.js";
import {
  follows,
  likes,
  notifications,
  tweets,
  users,
} from "../src/platform/database/schema.js";

import type { Database } from "../src/platform/database/client.js";

const topics = [
  "street photography",
  "weeknight cooking",
  "local hiking trails",
  "live music",
  "book clubs",
  "small gardens",
  "board games",
  "cycling routes",
  "coffee brewing",
  "sketching",
];
const namespace = "416b0bb3-5154-4ac6-9e33-3a58e76ce518";
export function demoCount(raw = "10"): number {
  if (!/^(?:[1-9][0-9]|100)$/.test(raw)) {
    throw new Error("Seed user count must be an integer from 10 to 100.");
  }
  return Number(raw);
}

/** A stable ID per fixture lets a larger run extend a smaller one without replacing existing rows. */
export async function seedDemo(
  db: Database,
  count: number,
  passwordHash: string,
) {
  const members = Array.from({ length: count }, (_, i) => {
    const username = `demo_${i + 1}`;
    const email = `${username}@example.test`;
    return {
      id: uuid(username, namespace),
      username,
      email,
      emailNormalized: email,
      displayName: `Local Explorer ${i + 1}`,
      bio: `Ask me about ${topics[i % topics.length]}.`,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
  await db.transaction(async (tx) => {
    // Ignore only our deterministic IDs. A real account occupying a demo name/email fails the transaction.
    await tx
      .insert(users)
      .values(members)
      .onConflictDoNothing({ target: users.id });
    const posts = members.map((m, i) => ({
      id: uuid(`post:${m.id}`, namespace),
      authorId: m.id,
      content: `Anyone interested in ${topics[i % topics.length]} this weekend?`,
      createdAt: m.createdAt,
    }));
    await tx
      .insert(tweets)
      .values(posts)
      .onConflictDoNothing({ target: tweets.id });
    const conversations = members.map((actor, index) => {
      const neighborIndex = index === 0 ? 1 : index - 1;
      const neighbor = members[neighborIndex];
      const post = posts[neighborIndex];
      if (!neighbor || !post) {
        throw new Error("Missing demo conversation target.");
      }
      return {
        actor,
        neighbor,
        post,
        replyId: uuid(`reply:${actor.id}`, namespace),
      };
    });
    await tx
      .insert(follows)
      .values(
        conversations.map(({ actor, neighbor }) => ({
          followerId: actor.id,
          followingId: neighbor.id,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(likes)
      .values(
        conversations.map(({ actor, post }) => ({
          userId: actor.id,
          tweetId: post.id,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(tweets)
      .values(
        conversations.map(({ actor, neighbor, post, replyId }) => ({
          id: replyId,
          authorId: actor.id,
          parentTweetId: post.id,
          content: `@${neighbor.username} I'm testing out threaded replies!`,
          createdAt: actor.createdAt,
        })),
      )
      .onConflictDoNothing({ target: tweets.id });
    await tx
      .insert(notifications)
      .values(
        conversations.map(({ actor, neighbor, replyId }) => {
          const event = {
            type: "reply" as const,
            actorId: actor.id,
            recipientId: neighbor.id,
            tweetId: replyId,
          };
          return {
            ...event,
            id: uuidv7(),
            createdAt: actor.createdAt,
            dedupeKey: notificationDedupeKey(event),
          };
        }),
      )
      .onConflictDoNothing({ target: notifications.dedupeKey });
  });
}
