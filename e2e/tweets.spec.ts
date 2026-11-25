import { expect, type Page, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  register,
  uniqueMember,
} from "./support";

const composer = (page: Page) =>
  page.getByRole("textbox", { name: "What's happening?" });
const newPosts = (page: Page) =>
  page.getByRole("list", { name: "Home timeline" });

async function post(page: Page, content: string) {
  await composer(page).fill(content);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Posted." }),
  ).toBeVisible();
}

test("TWT-02 US-B01 posts tweets, shows them newest first, and counts them on the profile", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByText(
      "Your timeline is empty. Post a tweet above, or search for people and follow them to see their posts here.",
    ),
  ).toBeVisible();

  // AC-B01.4: the counter blocks an over-limit post.
  await composer(page).fill("a".repeat(281));
  await expect(page.getByTestId("tweet-counter")).toHaveText("-1");
  await expect(
    page.getByRole("button", { name: "Post", exact: true }),
  ).toBeDisabled();

  // AC-B01.1: canonical cards appear newest first.
  await post(page, "First post!");
  await expect(composer(page)).toHaveValue("");
  await expect(composer(page)).toBeFocused();
  await post(page, "Second post!");
  const cards = newPosts(page).getByRole("article");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Second post!");
  await expect(
    cards
      .first()
      .getByRole("link", { name: `@${member.username}`, exact: true }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // The profile counts committed tweets (TWT-01).
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Profile" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/u/${member.username}$`), {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  await expect(page.getByLabel("Profile statistics")).toContainText("2");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Home" })
    .click();
  await expect(page).toHaveURL(/\/home$/, { timeout: FIRST_VISIT_TIMEOUT_MS });
});

test("TWT-02 US-B02 AC-B02.3 cancels, then confirms, a delete", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await expect(page).toHaveURL(/\/home$/);
  await post(page, "Short-lived");
  const card = newPosts(page)
    .getByRole("article")
    .filter({ hasText: "Short-lived" });

  await card.getByRole("button", { name: "Delete tweet" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this tweet?" });
  await expect(dialog).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Delete tweet" }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByText(
      "Your timeline is empty. Post a tweet above, or search for people and follow them to see their posts here.",
    ),
  ).toBeVisible();
});
