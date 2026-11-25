import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { FIRST_VISIT_TIMEOUT_MS, register, uniqueMember } from "./support";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function postWithImage(page: Page) {
  const file = join(tmpdir(), `dot-${Date.now()}.png`);
  await writeFile(file, PNG);
  await page.locator('input[type="file"]').setInputFiles(file);
  await page
    .getByRole("textbox", { name: "What's happening?" })
    .fill("With a picture");
  await page
    .getByRole("textbox", { name: "Image description" })
    .fill("One red pixel");
  await page.getByRole("button", { name: "Post", exact: true }).click();
}

test("IMG-01 US-F02 posts a tweet with an image and its description", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("button", { name: "Add image" })).toBeVisible();

  await postWithImage(page);

  const card = page.getByRole("article").first();
  await expect(card).toContainText("With a picture", {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  await expect(card.getByRole("img", { name: "One red pixel" })).toBeVisible();
});
