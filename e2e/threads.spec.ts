import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  register,
  uniqueMember,
} from "./support";

test("THR-01 US-B04 posts a nested reply and reads its branch signed out", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await register(page, uniqueMember(testInfo));
  await page
    .getByRole("textbox", { name: "What's happening?" })
    .fill("Start a thread");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const rootLink = page
    .getByRole("article")
    .filter({ hasText: "Start a thread" })
    .getByRole("link", { name: /Open thread/ });
  await expect(rootLink).toHaveAttribute("href", /^\/tweets\//);
  const href = await rootLink.getAttribute("href");
  if (href === null) throw new Error("Root thread link has no destination.");
  const root = new URL(href, baseURL);
  await rootLink.click();
  await expect(page).toHaveURL(root.href);
  await expect(
    page.getByRole("heading", { name: "Thread", exact: true }),
  ).toBeVisible({ timeout: FIRST_VISIT_TIMEOUT_MS });
  await page.getByRole("textbox", { name: "Your reply" }).fill("First reply");
  await page.getByRole("button", { name: "Post reply" }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "First reply" })
    .getByRole("link", { name: /Open thread/ })
    .click();
  await expect(
    page.getByRole("link", { name: "View parent tweet" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Your reply" }).fill("Nested reply");
  await page.getByRole("button", { name: "Post reply" }).click();
  // Text in the composer is visible before POST commits. Wait for the
  // canonical card in the replies list before starting a separate guest read.
  await expect(
    page
      .getByRole("list", { name: "Replies" })
      .getByRole("article")
      .filter({ hasText: "Nested reply" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Reply posted." }),
  ).toBeVisible();
  const publicContext = await browser.newContext(testInfo.project.use);
  try {
    const publicPage = await publicContext.newPage();
    await publicPage.goto(root.href);
    await expect(
      publicPage.getByRole("list", { name: "Replies" }).getByRole("article"),
    ).toHaveCount(2);
    await expect(
      publicPage.getByRole("link", { name: "Log in to reply" }),
    ).toBeVisible();
    await expect(publicPage.getByRole("textbox")).toHaveCount(0);
    await expectNoSeriousA11yViolations(publicPage);
  } finally {
    await publicContext.close();
  }
});
