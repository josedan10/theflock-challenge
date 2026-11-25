import { expect, test } from "@playwright/test";

import { FIRST_VISIT_TIMEOUT_MS, register, uniqueMember } from "./support";

test("US-B01 posts a tweet with ⌘/Ctrl+Enter while Enter adds a new line", async ({
  page,
}, testInfo) => {
  await register(page, uniqueMember(testInfo));
  await expect(page).toHaveURL(/\/home$/);
  const box = page.getByRole("textbox", { name: "What's happening?" });

  await box.fill("Typed fast");
  await box.press("Enter");
  await box.pressSequentially("then sent");
  await expect(box).toHaveValue("Typed fast\nthen sent");
  // ⌘ on macOS, Ctrl elsewhere, like the people using it.
  await box.press("ControlOrMeta+Enter");

  await expect(
    page
      .getByRole("list", { exact: true, name: "Home" })
      .getByRole("article")
      .filter({ hasText: "then sent" }),
  ).toBeVisible({ timeout: FIRST_VISIT_TIMEOUT_MS });
  await expect(box).toHaveValue("");
});
