import { expect, test } from "@playwright/test";

test("FND-03 AC-1 renders the responsive landing page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Twitter Clone" }),
  ).toBeVisible();
  await expect(page.getByText("Accounts and posts are public.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create account" }),
  ).toHaveAttribute("href", "/register");
  await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    "/login",
  );
});

test("US-E01 AC-E01.4 an unknown address returns 404 and offers keyboard navigation home", async ({
  page,
}) => {
  const response = await page.goto("/missing/example-page");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This link went quiet." }),
  ).toBeVisible();
  const home = page.getByRole("link", { name: "Back to the start" });
  await home.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/");
});
