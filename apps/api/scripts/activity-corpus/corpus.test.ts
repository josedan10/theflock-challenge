import { access } from "node:fs/promises";

import { codePointLength } from "@twitter-clone/contracts";
import { expect, it } from "vitest";

import { activityCorpus } from "./corpus.js";

it("DEV-01 keeps 200 simulator lines with optional pictures", async () => {
  expect(activityCorpus).toHaveLength(200);
  expect(new Set(activityCorpus.map((line) => line.id)).size).toBe(200);
  const posts = new Set(
    activityCorpus
      .filter((line) => line.kind === "post")
      .map((line) => line.id),
  );
  expect(posts.size).toBe(120);
  let images = 0;
  for (const line of activityCorpus) {
    expect(line.text).toBe(line.text.trim());
    expect(line.text.length).toBeGreaterThan(0);
    expect(codePointLength(line.text)).toBeLessThanOrEqual(280);
    if (line.kind === "reply") {
      expect(line.parentId).not.toBeNull();
      expect(posts.has(line.parentId ?? "")).toBe(true);
      expect(line.image).toBeNull();
    } else {
      expect(line.parentId).toBeNull();
    }
    if (line.image !== null) {
      images += 1;
      await access(new URL(`./images/${line.image}`, import.meta.url));
    }
  }
  expect(images).toBe(30);
  expect(activityCorpus.some((line) => line.text.includes("{mention}"))).toBe(
    true,
  );
});
