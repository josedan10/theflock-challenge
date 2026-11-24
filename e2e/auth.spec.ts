import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const password = "correct horse battery";

/** Unique per test, project, and run, so parallel runs never collide. */
function uniqueMember(testInfo: {
  project: { name: string };
  workerIndex: number;
}) {
  const suffix = `${Date.now().toString(36)}${testInfo.workerIndex}${Math.random().toString(36).slice(2, 6)}`;
  const tag = testInfo.project.name.includes("mobile") ? "m" : "d";
  return {
    email: `e2e-${tag}${suffix}@example.com`,
    username: `e2e_${tag}${suffix}`.slice(0, 30),
  };
}

async function register(
  page: Page,
  member: { email: string; username: string },
) {
  await page.goto("/register");
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Username").fill(member.username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/**
 * The form-level alert. Next.js renders a route announcer with role=alert,
 * and field errors are alerts too, so both are excluded.
 */
function formAlert(page: Page) {
  return page.locator('form [role="alert"]:not([data-slot="field-error"])');
}

/** Budget for a navigation that may trigger a first `next dev` route compile. */
const FIRST_VISIT_TIMEOUT_MS = 15_000;

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious.map((violation) => violation.id)).toEqual([]);
}

test("US-A01 AC-A01.1 US-A02 AC-A02.3 registers, reaches home, and logs out", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);

  await register(page, member);

  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("heading", { name: `Welcome, ${member.username}` }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});

test("US-A01 AC-A01.2 shows a duplicate email on its field", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await register(page, {
    ...member,
    username: `${member.username.slice(0, 27)}_2`,
  });

  await expect(formAlert(page)).toHaveText("Some fields are already in use.");
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page).toHaveURL(/\/register$/);
});

test("US-A02 AC-A02.1 AC-A02.2 rejects a wrong password, then logs in and survives a reload", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login");
  await expectNoSeriousA11yViolations(page);
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill("wrong password!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(formAlert(page)).toHaveText("Invalid email or password.");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: `Welcome, ${member.username}` }),
  ).toBeVisible();
});

test("US-A02 AC-A02.4 sends a signed-out visitor from /home to /login", async ({
  page,
}) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/login$/);
});

test("US-A01 AC-A01.3 validates registration locally with accessible errors", async ({
  page,
}) => {
  await page.goto("/register");
  await expectNoSeriousA11yViolations(page);

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(formAlert(page)).toHaveText("Fix the highlighted fields.");
  await expect(page.getByLabel("Email")).toBeFocused();
  await expectNoSeriousA11yViolations(page);
});

test("PRO-02 US-A03 AC-A03.1 AC-A03.3 shows and edits a responsive accessible profile", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole("link", { name: `@${member.username}` }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${member.username}$`));
  await expect(
    page.getByRole("heading", { name: member.username }),
  ).toBeVisible();
  await expect(page.getByLabel("Profile statistics")).toContainText("Tweets");
  await expect(
    page.getByLabel(`${member.username}'s avatar placeholder`),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByLabel("Display name").fill("Ada Browser");
  await page.getByLabel("Bio").fill("Plain <strong>text</strong>");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(
    page.getByRole("heading", { name: "Ada Browser" }),
  ).toBeVisible();
  await expect(page.getByText("Plain <strong>text</strong>")).toBeVisible();
  await expect(page.locator("article strong")).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("PRO-02 US-A03 AC-A03.2 shows an unknown profile state", async ({
  page,
}) => {
  await page.goto("/u/this_profile_does_not_exist");

  await expect(
    page.getByRole("heading", { name: "Profile not found" }),
  ).toBeVisible();
  await expect(page.getByText("That profile does not exist.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test("navigates between home and the member's profile from the header", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await expect(page).toHaveURL(/\/home$/);
  const primary = page.getByRole("navigation", { name: "Primary" });

  await primary.getByRole("link", { name: "Profile" }).click();
  // `next dev` compiles a route on its first visit, which can exceed the
  // default 5 s under parallel load. This is a time budget, not a retry.
  await expect(page).toHaveURL(new RegExp(`/u/${member.username}$`), {
    timeout: FIRST_VISIT_TIMEOUT_MS,
  });
  await expect(page).toHaveTitle("Profile · Twitter Clone");
  await expect(primary.getByRole("link", { name: "Profile" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await primary.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/home$/, { timeout: FIRST_VISIT_TIMEOUT_MS });
  // Client navigation applies the new <title> slightly after the URL changes;
  // scan only once the page has settled.
  await expect(page).toHaveTitle("Home · Twitter Clone");
  await expect(primary.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expectNoSeriousA11yViolations(page);
});

test("offers Log in and Create account on a public profile when signed out", async ({
  page,
}, testInfo) => {
  const member = uniqueMember(testInfo);
  await register(page, member);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/u/${member.username}`);

  await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(
    page.getByRole("link", { name: "Create account" }),
  ).toHaveAttribute("href", "/register");
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
});
