import { expect, type Page, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  register,
  uniqueMember,
} from "./support";

async function post(page: Page, text: string) {
  await page.getByRole("textbox", { name: "What's happening?" }).fill(text);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const card = page
    .getByRole("list", { name: "Home", exact: true })
    .getByRole("article")
    .filter({ hasText: text });
  await expect(card).toBeVisible({ timeout: FIRST_VISIT_TIMEOUT_MS });
  return card;
}

test("TWT-03 AC-B01.5 AC-B01.6 undoes a new post at once, and later posts need the confirmed delete", async ({
  page,
}, testInfo) => {
  await register(page, uniqueMember(testInfo));
  await expect(page).toHaveURL(/\/home$/);

  const mistake = await post(page, "Oops, wrong account");
  await expect(page.getByText("Posting your tweet…")).toHaveCount(0);
  await expect(mistake.getByText(/Undo available for/)).toBeVisible();
  await mistake.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(mistake).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Oops, wrong account")).toHaveCount(0);

  const keeper = await post(page, "This one stays");
  await expect(keeper.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(keeper.getByRole("button", { name: "Undo" })).toHaveCount(0, {
    timeout: 7_000,
  });
  await expectNoSeriousA11yViolations(page);
  await keeper.getByRole("button", { name: "Delete tweet" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Delete this tweet?" }),
  ).toBeVisible();
});
