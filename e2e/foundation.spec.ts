import { expect, test } from "@playwright/test";

test("FND-03 AC-1 renders the responsive application foundation", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Twitter Clone" }),
  ).toBeVisible();
  await expect(
    page.getByText("ready for the first product feature"),
  ).toBeVisible();
});
