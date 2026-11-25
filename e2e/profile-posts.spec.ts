import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  password,
  register,
  uniqueMember,
} from "./support";

const apiUrl = "http://127.0.0.1:4100";

test("PRO-03 US-A03 AC-A03.4 lists a member's tweets and replies and drops a deleted post", async ({
  page,
  playwright,
}, testInfo) => {
  test.setTimeout(60_000);
  const ada = uniqueMember(testInfo);
  await register(page, ada);
  await expect(page).toHaveURL(/\/home$/);
  const composer = page.getByRole("textbox", { name: "What's happening?" });
  async function post(content: string) {
    await composer.fill(content);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Posted." }),
    ).toBeVisible();
    await expect(composer).toHaveValue("");
  }
  await post("First from Ada");
  await post("Second from Ada");
  const adaCard = page
    .getByRole("article")
    .filter({ hasText: "Second from Ada" });
  const thread = adaCard.getByRole("link", { name: /Open thread/ });
  await expect(thread).toHaveAttribute("href", /^\/tweets\//);
  const href = await thread.getAttribute("href");
  const tweetId = href?.split("/").at(-1);
  if (tweetId === undefined || tweetId.length === 0) {
    throw new Error("Posted tweet has no thread link.");
  }

  const grace = uniqueMember(testInfo);
  const graceApi = await playwright.request.newContext();
  try {
    const registered = await graceApi.post(`${apiUrl}/v1/auth/register`, {
      data: {
        displayName: "Grace",
        email: grace.email,
        password,
        username: grace.username,
      },
    });
    expect(registered.ok()).toBeTruthy();
    const me = await graceApi.get(`${apiUrl}/v1/me`);
    const csrf = ((await me.json()) as { csrfToken: string }).csrfToken;
    const reply = await graceApi.post(
      `${apiUrl}/v1/tweets/${tweetId}/replies`,
      {
        data: { content: "Grace replies" },
        headers: { "x-csrf-token": csrf },
      },
    );
    expect(reply.ok()).toBeTruthy();
  } finally {
    await graceApi.dispose();
  }

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Profile" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/u/${ada.username}$`), {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  const posts = page.getByRole("list", { name: "Posts" });
  await expect(posts.getByRole("article")).toHaveCount(2);
  await expect(posts.getByRole("article").first()).toContainText(
    "Second from Ada",
  );
  await expect(posts.getByText("Grace replies")).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  await page.goto(`/u/${grace.username}`);
  const gracePosts = page.getByRole("list", { name: "Posts" });
  await expect(gracePosts.getByRole("article")).toHaveCount(1, {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  await expect(gracePosts).toContainText("Grace replies");
  await expect(
    gracePosts.getByRole("link", { name: `@${ada.username}` }),
  ).toBeVisible();

  await page.goto(`/u/${ada.username}`);
  const own = page.getByRole("list", { name: "Posts" });
  const second = own
    .getByRole("article")
    .filter({ hasText: "Second from Ada" });
  await second.getByRole("button", { name: "Delete tweet" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete this tweet?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(second).toHaveCount(0);
  await expect(own.getByRole("article")).toHaveCount(1);
  await expect(page.getByLabel("Profile statistics")).toContainText("1");
});
