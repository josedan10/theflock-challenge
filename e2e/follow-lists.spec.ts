import { expect, type APIRequestContext, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  password,
  register,
  uniqueMember,
} from "./support";

const apiUrl = "http://127.0.0.1:4100";

/** Registers through the API and returns the session's CSRF token. */
async function registerByApi(
  request: APIRequestContext,
  member: { email: string; username: string },
): Promise<string> {
  const registered = await request.post(`${apiUrl}/v1/auth/register`, {
    data: { email: member.email, password, username: member.username },
  });
  expect(registered.ok()).toBeTruthy();
  const { csrfToken } = (await registered.json()) as { csrfToken: string };
  return csrfToken;
}

test("US-C03 AC-C03.1 AC-C03.2 US-C01 AC-C01.1 browses follow lists and follows from a row", async ({
  page,
  playwright,
}, testInfo) => {
  const grace = uniqueMember(testInfo);
  const linus = uniqueMember(testInfo);
  const graceApi = await playwright.request.newContext();
  const linusApi = await playwright.request.newContext();
  await registerByApi(graceApi, grace);
  const linusCsrf = await registerByApi(linusApi, linus);
  const followed = await linusApi.put(
    `${apiUrl}/v1/users/${grace.username}/follow`,
    { headers: { "x-csrf-token": linusCsrf } },
  );
  expect(followed.ok()).toBeTruthy();

  const ada = uniqueMember(testInfo);
  await register(page, ada);
  await expect(page).toHaveURL(/\/home$/);

  await page.goto(`/u/${grace.username}`);
  await page
    .getByRole("link", { name: "1 Followers" })
    .click({ timeout: FIRST_VISIT_TIMEOUT_MS });
  await expect(page).toHaveURL(new RegExp(`/u/${grace.username}/followers$`), {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  await expect(page).toHaveTitle(/Followers/);
  const list = page.getByRole("list", { name: /Followers/ });
  await expect(
    list.getByRole("link", { name: `@${linus.username}` }),
  ).toBeVisible();
  await expect(
    page.getByText("That's everyone who follows them."),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole("button", { name: `Follow @${linus.username}` }).click();
  await expect(
    page.getByRole("button", { name: `Unfollow @${linus.username}` }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Unfollow @${linus.username}` }),
  ).toBeVisible();

  await page.goto(`/u/${ada.username}/following`);
  await expect(
    page.getByRole("list", { name: /Following/ }).getByRole("link", {
      name: `@${linus.username}`,
    }),
  ).toBeVisible({ timeout: FIRST_VISIT_TIMEOUT_MS });

  await page.goto(`/u/${linus.username}/followers`);
  const ownRow = page.getByRole("listitem").filter({ hasText: "(you)" });
  await expect(ownRow).toBeVisible();
  await expect(ownRow.getByRole("button")).toHaveCount(0);

  await page.getByRole("link", { name: "Following" }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${linus.username}/following$`));
  await expect(
    page.getByRole("link", { name: `@${grace.username}` }),
  ).toBeVisible();

  await page.goto(`/u/${ada.username}/followers`);
  await expect(page.getByText("No followers yet.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await graceApi.dispose();
  await linusApi.dispose();
});
