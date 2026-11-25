import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  password,
  register,
  uniqueMember,
} from "./support";

const apiUrl = "http://127.0.0.1:4100";

test("US-C01 AC-C01.1 AC-C01.3 follow shows their tweets, then unfollow hides them", async ({
  page,
  request,
}, testInfo) => {
  const grace = uniqueMember(testInfo);
  const registered = await request.post(`${apiUrl}/v1/auth/register`, {
    data: {
      email: grace.email,
      password,
      username: grace.username,
    },
  });
  expect(registered.ok()).toBeTruthy();
  const graceSession = await request.get(`${apiUrl}/v1/me`);
  expect(graceSession.ok()).toBeTruthy();
  const { csrfToken: graceCsrf } = (await graceSession.json()) as {
    csrfToken: string;
  };
  const tweet = await request.post(`${apiUrl}/v1/tweets`, {
    data: { content: "Hello from Grace" },
    headers: { "x-csrf-token": graceCsrf },
  });
  expect(tweet.ok()).toBeTruthy();

  const ada = uniqueMember(testInfo);
  await register(page, ada);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Hello from Grace")).toHaveCount(0);

  const adaSession = await page.request.get(`${apiUrl}/v1/me`);
  expect(adaSession.ok()).toBeTruthy();
  const { csrfToken } = (await adaSession.json()) as { csrfToken: string };
  const selfFollow = await page.request.put(
    `${apiUrl}/v1/users/${ada.username}/follow`,
    { headers: { "x-csrf-token": csrfToken } },
  );
  expect(selfFollow.status()).toBe(422);

  const followed = await page.request.put(
    `${apiUrl}/v1/users/${grace.username}/follow`,
    { headers: { "x-csrf-token": csrfToken } },
  );
  expect(followed.ok()).toBeTruthy();
  await expect(followed.json()).resolves.toEqual({
    relationship: { followerCount: 1, following: true },
  });

  await page.reload();
  await expect(page.getByText("Hello from Grace")).toBeVisible();
  const profile = await page.request.get(
    `${apiUrl}/v1/users/${grace.username}`,
  );
  expect(profile.ok()).toBeTruthy();
  await expect(profile.json()).resolves.toMatchObject({
    profile: { followerCount: 1 },
  });
  await expectNoSeriousA11yViolations(page);

  const unfollowed = await page.request.delete(
    `${apiUrl}/v1/users/${grace.username}/follow`,
    { headers: { "x-csrf-token": csrfToken } },
  );
  expect(unfollowed.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText("Hello from Grace")).toHaveCount(0);
});
