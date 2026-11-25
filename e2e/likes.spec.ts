import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  register,
  uniqueMember,
} from "./support";

test("US-C02 AC-C02.2 likes and unlikes a tweet from its heart, and the count survives a reload", async ({
  page,
}, testInfo) => {
  await register(page, uniqueMember(testInfo));
  await expect(page).toHaveURL(/\/home$/);
  await page
    .getByRole("textbox", { name: "What's happening?" })
    .fill("Heart me");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const card = page
    .getByRole("list", { name: "Home" })
    .getByRole("article")
    .filter({ hasText: "Heart me" });
  await expect(card).toBeVisible({ timeout: FIRST_VISIT_TIMEOUT_MS });

  await card.getByRole("button", { name: "Like, 0 likes" }).click();
  const liked = card.getByRole("button", { name: "Like, 1 like" });
  await expect(liked).toHaveAttribute("aria-pressed", "true");
  await expect(liked).toBeEnabled();

  await page.reload();
  const reloaded = page
    .getByRole("list", { name: "Home" })
    .getByRole("article")
    .filter({ hasText: "Heart me" });
  await expect(
    reloaded.getByRole("button", { name: "Like, 1 like" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expectNoSeriousA11yViolations(page);

  await reloaded.getByRole("button", { name: "Like, 1 like" }).click();
  await expect(
    reloaded.getByRole("button", { name: "Like, 0 likes" }),
  ).toHaveAttribute("aria-pressed", "false");

  await reloaded.getByRole("link", { name: /^Open thread/ }).click();
  await expect(
    page.getByRole("heading", { name: "Thread", exact: true }),
  ).toBeVisible({ timeout: FIRST_VISIT_TIMEOUT_MS });
  await expect(
    page.getByRole("button", { name: "Reply, 0 replies" }),
  ).toBeVisible();
});
