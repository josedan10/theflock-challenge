import { expect, test } from "@playwright/test";

import {
  expectNoSeriousA11yViolations,
  FIRST_VISIT_TIMEOUT_MS,
  password,
  register,
  uniqueMember,
} from "./support";

const apiUrl = "http://127.0.0.1:4100";

test("SRC-02 US-D01 AC-D01.1 AC-D01.4 searches people, follows one, and handles empty results", async ({
  page,
  playwright,
}, testInfo) => {
  const grace = uniqueMember(testInfo);
  const graceApi = await playwright.request.newContext();
  const registered = await graceApi.post(`${apiUrl}/v1/auth/register`, {
    data: {
      displayName: "Grace O'Searchable",
      email: grace.email,
      password,
      username: grace.username,
    },
  });
  expect(registered.ok()).toBeTruthy();
  await graceApi.dispose();

  const ada = uniqueMember(testInfo);
  await register(page, ada);
  await expect(page).toHaveURL(/\/home$/);

  await page
    .getByRole("link", { name: "Search" })
    .click({ timeout: FIRST_VISIT_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/search$/, {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  await expect(page).toHaveTitle(/Search/);
  const field = page.getByRole("searchbox", { name: "Name or username" });

  await field.fill("g");
  await expect(
    page.getByText("Keep typing: at least 2 characters."),
  ).toBeVisible();

  await field.fill(`@${grace.username}`);
  const results = page.getByRole("list", { name: "Search results" });
  await expect(
    results.getByRole("link", { name: `@${grace.username}` }),
  ).toBeVisible();
  await expect(results.getByText("Grace O'Searchable")).toBeVisible();
  await expect(page).toHaveURL(/\?q=/);
  await expectNoSeriousA11yViolations(page);

  await results
    .getByRole("button", { name: `Follow @${grace.username}` })
    .click();
  await expect(
    results.getByRole("button", { name: `Unfollow @${grace.username}` }),
  ).toBeEnabled();

  await page.reload();
  await expect(field).toHaveValue(`@${grace.username}`, {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  await expect(
    page
      .getByRole("list", { name: "Search results" })
      .getByRole("button", { name: `Unfollow @${grace.username}` }),
  ).toBeVisible();

  await field.fill("' OR '1'='1");
  await expect(page.getByText("No people match “' OR '1'='1”.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
