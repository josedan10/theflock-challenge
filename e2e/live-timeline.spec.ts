import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  password,
  register,
  uniqueMember,
} from "./support";

const apiUrl = "http://127.0.0.1:4100";

test("LIVE-01 US-F01 AC-F01.2 shows a followed member's tweet without stealing focus", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  const author = uniqueMember(testInfo);
  const registered = await request.post(`${apiUrl}/v1/auth/register`, {
    data: {
      email: author.email,
      password,
      username: author.username,
    },
  });
  expect(registered.ok()).toBeTruthy();
  const authorSession = await request.get(`${apiUrl}/v1/me`);
  expect(authorSession.ok()).toBeTruthy();
  const { csrfToken: authorCsrf } = (await authorSession.json()) as {
    csrfToken: string;
  };

  const viewer = uniqueMember(testInfo);
  const streamStarted = page.waitForResponse(
    (response) =>
      response.url().includes("/v1/timeline/stream") &&
      response.ok() &&
      (response.headers()["content-type"] ?? "").includes("text/event-stream"),
  );
  await register(page, viewer);
  await expect(page).toHaveURL(/\/home$/);
  await streamStarted;

  const viewerSession = await page.request.get(`${apiUrl}/v1/me`);
  expect(viewerSession.ok()).toBeTruthy();
  const { csrfToken } = (await viewerSession.json()) as { csrfToken: string };
  const followed = await page.request.put(
    `${apiUrl}/v1/users/${author.username}/follow`,
    { headers: { "x-csrf-token": csrfToken } },
  );
  expect(followed.ok()).toBeTruthy();

  const composer = page.getByRole("textbox", { name: "What's happening?" });
  await composer.focus();
  await expect(composer).toBeFocused();

  const content = `Live post ${Date.now().toString(36)}`;
  const created = await request.post(`${apiUrl}/v1/tweets`, {
    data: { content },
    headers: { "x-csrf-token": authorCsrf },
  });
  expect(created.ok()).toBeTruthy();

  await expect(
    page.getByRole("article").filter({ hasText: content }),
  ).toBeVisible();
  await expect(composer).toBeFocused();
  await expectNoSeriousA11yViolations(page);
});
