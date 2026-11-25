import { expect, type APIRequestContext, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  password,
  register,
  uniqueMember,
} from "./support";

const apiUrl = "http://127.0.0.1:4100";

async function csrfOf(request: APIRequestContext): Promise<string> {
  const me = await request.get(`${apiUrl}/v1/me`);
  expect(me.ok()).toBeTruthy();
  return ((await me.json()) as { csrfToken: string }).csrfToken;
}

test("NOT-01 shows another member's follow, like and reply, and clears them", async ({
  page,
  playwright,
}, testInfo) => {
  const ada = uniqueMember(testInfo);
  await register(page, ada);
  await expect(page).toHaveURL(/\/home$/);
  const adaCsrf = await csrfOf(page.request);
  const posted = await page.request.post(`${apiUrl}/v1/tweets`, {
    data: { content: "Notify me" },
    headers: { "x-csrf-token": adaCsrf },
  });
  const tweetId = ((await posted.json()) as { tweet: { id: string } }).tweet.id;

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
    const headers = { "x-csrf-token": await csrfOf(graceApi) };
    for (const response of [
      await graceApi.put(`${apiUrl}/v1/users/${ada.username}/follow`, {
        headers,
      }),
      await graceApi.put(`${apiUrl}/v1/tweets/${tweetId}/like`, { headers }),
      await graceApi.post(`${apiUrl}/v1/tweets/${tweetId}/replies`, {
        data: { content: "Great tweet!" },
        headers,
      }),
    ]) {
      expect(response.ok()).toBeTruthy();
    }
  } finally {
    await graceApi.dispose();
  }

  await page.reload();
  const bell = page.getByRole("link", { name: "Notifications 3 unread" });
  await expect(bell).toBeVisible({ timeout: FIRST_VISIT_TIMEOUT_MS });
  await bell.click();
  await expect(page).toHaveURL(/\/notifications$/, {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  const list = page.getByRole("list", { name: "Notifications" });
  await expect(list.getByRole("link")).toHaveCount(3);
  await expect(list.getByRole("link").first()).toContainText(
    "Grace replied to your tweet",
  );
  await expect(list.getByText("Great tweet!")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await list.getByRole("link").filter({ hasText: "liked your tweet" }).click();
  await expect(page).toHaveURL(new RegExp(`/tweets/${tweetId}$`));
  await expect(
    page.getByRole("link", { name: "Notifications 2 unread" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Notifications 2 unread" }).click();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(
    page.getByRole("link", { exact: true, name: "Notifications" }),
  ).toBeVisible();
  await expect(list.getByText("Unread.")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mark all as read" }),
  ).toBeDisabled();
});
