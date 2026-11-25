import { mentionedUsernames } from "@twitter-clone/contracts";
import { sql } from "drizzle-orm";
import { v5 as uuid, v7 as uuidv7 } from "uuid";

import {
  notificationDedupeKey,
  recordNotification,
} from "../src/modules/notifications/infrastructure/record-notification.js";
import {
  follows,
  likes,
  notifications,
  tweets,
  users,
} from "../src/platform/database/schema.js";

import type { Database } from "../src/platform/database/client.js";

const namespace = "416b0bb3-5154-4ac6-9e33-3a58e76ce518";

/** Stable ID of a seeded account, so other local tools can tell it from a real member. */
export function demoUserId(username: string): string {
  return uuid(username, namespace);
}

const givenNames = [
  "Maya",
  "Andre",
  "Priya",
  "Jonah",
  "Elena",
  "Samir",
  "Nora",
  "Luis",
  "Hana",
  "Owen",
];
const familyNames = [
  "Chen",
  "Brooks",
  "Nair",
  "Okeke",
  "Varga",
  "Rahman",
  "Silva",
  "Ibarra",
  "Park",
  "Doyle",
];

/** First ten voices are the default seed. Later accounts reuse a voice in another place. */
const voices = [
  {
    bio: "I shoot film on the walk to work and keep the frames that still surprise me.",
    post: "The light on the south platform lasted about four minutes. I used all of them.",
    replies: [
      "That south-platform light is the same ten minutes I keep trying to draw.",
      "Four minutes is generous. I usually arrive as it goes flat.",
    ],
  },
  {
    bio: "Weeknight cook. I write down what actually worked once the dishes are done.",
    post: "Brown the onions longer than feels reasonable. The rest of the soup depends on it.",
    replies: [
      "That pan sauce is the one I never have the patience for. Writing the steps down.",
      "I always pull the onions too early. Trying the longer version tonight.",
    ],
  },
  {
    bio: "Out on the ridge trails before breakfast. I turn around when the weather changes.",
    post: "Fog sat in the valley until nine. The ridge stayed clear the whole time.",
    replies: [
      "Which trailhead was that? I always underestimate the last mile back.",
      "I had the same fog on the valley road and turned around. Glad you kept going.",
    ],
  },
  {
    bio: "I go to small rooms to hear bands before they start playing bigger ones.",
    post: "The quartet at the hall played the last tune unamplified. Nobody checked a phone.",
    replies: [
      "Was the horn section late, or was that the arrangement? I stayed for the closer.",
      "An unamplified closer is rare in that room. Wish I had been there.",
    ],
  },
  {
    bio: "I host a Tuesday book club that usually goes long because of the side arguments.",
    post: "We argued for an hour about the ending, and nobody remembered the same last page.",
    replies: [
      "Halfway through that novel. The sister's chapter is the one I keep rereading.",
      "Our group split on the ending too. I am still not sure the narrator is reliable.",
    ],
  },
  {
    bio: "Balcony gardener. Most of what I know came from killing a plant and trying again.",
    post: "First ripe tomatoes this week. They tasted like the weather had finally cooperated.",
    replies: [
      "The tomatoes on my balcony never get that much sun. Yours sound like a different plant.",
      "Saving this. Mine are still green and I have been blaming the pot.",
    ],
  },
  {
    bio: "Board games on Thursday. I care more about the table than about who wins.",
    post: "Six people, one new game, and we still finished before the last train.",
    replies: [
      "I can come Thursday. Bringing the train game, not the one we abandoned.",
      "Finishing before the last train is the real victory. Count me in next week.",
    ],
  },
  {
    bio: "I ride the river path to work unless the wind is doing something unreasonable.",
    post: "Tailwind on the way in and a headwind all the way home. The ride still cleared my head.",
    replies: [
      "That river path is closed at the bridge this week. The market detour is nicer.",
      "I took the headwind direction this morning and regretted it by the second bridge.",
    ],
  },
  {
    bio: "I keep notes on beans and kettles, then ignore them when a cup tastes right.",
    post: "New beans from the shop on Pine. Two degrees cooler and the cup finally opened up.",
    replies: [
      "I tried the cooler pour this morning. Less bitter, and I was late anyway.",
      "The Pine Street beans have been harsh for me. I will drop the temperature.",
    ],
  },
  {
    bio: "I sketch people waiting for things: buses, coffee, the light to change.",
    post: "Filled three pages at the station while the train sat there. Nobody was in a hurry.",
    replies: [
      "The sketch of the station clock is the one I would put on a wall.",
      "I was on that platform and did not notice you drawing. The pages sound wonderful.",
    ],
  },
];

const places = [
  "the harbor",
  "the mill district",
  "the night market",
  "the west ridge",
  "the old station",
  "the river path",
  "Pine Street",
  "the Sunday market",
  "the east bridge",
  "the courtyard",
];

export function demoCount(raw = "10"): number {
  if (!/^(?:[1-9][0-9]|100)$/.test(raw)) {
    throw new Error("Seed user count must be an integer from 10 to 100.");
  }
  return Number(raw);
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error("Missing demo fixture.");
  }
  return value;
}

function displayName(index: number): string {
  const given = at(givenNames, index % givenNames.length);
  const family = at(
    familyNames,
    (index + Math.floor(index / givenNames.length)) % familyNames.length,
  );
  return `${given} ${family}`;
}

function placeFor(index: number): string {
  return at(places, Math.floor(index / voices.length) % places.length);
}

function voiceFor(index: number): (typeof voices)[number] {
  return at(voices, index % voices.length);
}

function bio(index: number): string {
  const voice = voiceFor(index);
  if (index < voices.length) {
    return voice.bio;
  }
  return `${voice.bio} Usually around ${placeFor(index)}.`;
}

function post(index: number): string {
  const voice = voiceFor(index);
  if (index < voices.length) {
    return voice.post;
  }
  return `${voice.post} Same kind of day in ${placeFor(index)}.`;
}

function reply(
  actorIndex: number,
  neighborIndex: number,
  username: string,
): string {
  const voice = voiceFor(neighborIndex);
  const line = at(voice.replies, actorIndex % voice.replies.length);
  return `@${username} ${line}`;
}

/** A stable ID per fixture lets a larger run extend a smaller one without replacing existing rows. */
export async function seedDemo(
  db: Database,
  count: number,
  passwordHash: string,
) {
  const members = Array.from({ length: count }, (_, index) => {
    const username = `demo_${index + 1}`;
    const email = `${username}@example.test`;
    return {
      id: demoUserId(username),
      username,
      email,
      emailNormalized: email,
      displayName: displayName(index),
      bio: bio(index),
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
  await db.transaction(async (tx) => {
    // Refresh fixture copy only. A real account on a demo name still fails, and the password stays.
    await tx
      .insert(users)
      .values(members)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          displayName: sql`excluded.display_name`,
          bio: sql`excluded.bio`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
    const posts = members.map((member, index) => ({
      id: uuid(`post:${member.id}`, namespace),
      authorId: member.id,
      content: post(index),
      createdAt: member.createdAt,
    }));
    await tx
      .insert(tweets)
      .values(posts)
      .onConflictDoUpdate({
        target: tweets.id,
        set: { content: sql`excluded.content` },
      });
    const conversations = members.map((actor, index) => {
      const neighborIndex = index === 0 ? 1 : index - 1;
      const neighbor = members[neighborIndex];
      const neighborPost = posts[neighborIndex];
      if (!neighbor || !neighborPost) {
        throw new Error("Missing demo conversation target.");
      }
      return {
        actor,
        neighbor,
        post: neighborPost,
        replyId: uuid(`reply:${actor.id}`, namespace),
        content: reply(index, neighborIndex, neighbor.username),
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
        conversations.map(({ actor, post: liked }) => ({
          userId: actor.id,
          tweetId: liked.id,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(tweets)
      .values(
        conversations.map(({ actor, post: parent, replyId, content }) => ({
          id: replyId,
          authorId: actor.id,
          parentTweetId: parent.id,
          content,
          createdAt: actor.createdAt,
        })),
      )
      .onConflictDoUpdate({
        target: tweets.id,
        set: { content: sql`excluded.content` },
      });
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
    const memberIds = new Map(
      members.map((member) => [member.username, member.id]),
    );
    const spoken = [
      ...posts.map((post) => ({
        authorId: post.authorId,
        content: post.content,
        createdAt: post.createdAt,
        id: post.id,
      })),
      ...conversations.map((conversation) => ({
        authorId: conversation.actor.id,
        content: conversation.content,
        createdAt: conversation.actor.createdAt,
        id: conversation.replyId,
      })),
    ];
    for (const line of spoken) {
      for (const username of mentionedUsernames(line.content)) {
        const recipientId = memberIds.get(username);
        if (recipientId === undefined) {
          continue;
        }
        await recordNotification(
          tx,
          {
            actorId: line.authorId,
            recipientId,
            tweetId: line.id,
            type: "mention",
          },
          line.createdAt,
        );
      }
    }
  });
}
