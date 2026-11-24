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
