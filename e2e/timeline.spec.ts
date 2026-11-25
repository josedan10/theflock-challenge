import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  register,
  uniqueMember,
} from "./support";

// Same origin the Playwright web server calls. Kept here so the journey can
// seed a full page without typing twenty-one posts.
const apiUrl = "http://127.0.0.1:4100";

test("FEED-02 US-B03 pages the home timeline without duplicates", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  // Scrolling to "Load more" also reveals the infinite-scroll sentinel, which
  // could load the page and remove the button mid-click. Without
  // IntersectionObserver the feed falls back to the button alone, so this
  // journey exercises that path deterministically.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "IntersectionObserver");
  });
  const member = uniqueMember(testInfo);
  await register(page, member);
  await expect(page).toHaveURL(/\/home$/);

  const me = await page.request.get(`${apiUrl}/v1/me`);
  expect(me.ok()).toBeTruthy();
  const { csrfToken } = (await me.json()) as { csrfToken: string };
  for (let n = 1; n <= 21; n += 1) {
    const created = await page.request.post(`${apiUrl}/v1/tweets`, {
      data: { content: `Timeline ${String(n).padStart(2, "0")}` },
      headers: { "x-csrf-token": csrfToken },
    });
    expect(created.ok()).toBeTruthy();
  }

  await page.reload();
  const cards = page.getByRole("list", { name: "Home" }).getByRole("article");
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).toContainText("Timeline 21");
  await expect(page.getByText("Timeline 01", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(cards).toHaveCount(21);
  await expect(cards.last()).toContainText("Timeline 01");
  await expect(page.getByText("Timeline 21", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("status").filter({
      hasText: "You've reached the end of your timeline.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});
