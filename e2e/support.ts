import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Shared browser-journey helpers. Not a spec file, so Playwright does not run it. */
export const password = "correct horse battery";

/** Unique per test, project, and run, so parallel runs never collide. */
export function uniqueMember(testInfo: {
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

export async function register(
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
export function formAlert(page: Page) {
  return page.locator('form [role="alert"]:not([data-slot="field-error"])');
}

/** Budget for a navigation that may trigger a first `next dev` route compile. */
export const FIRST_VISIT_TIMEOUT_MS = 15_000;

/**
 * Scans the settled page. Entrance motion fades new cards in, and axe would
 * otherwise measure that partial opacity as a contrast failure.
 */
async function waitForFiniteAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pending = document.getAnimations().filter((animation) => {
      const iterations = animation.effect?.getComputedTiming().iterations;
      return iterations !== Infinity;
    });
    await Promise.all(
      pending.map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

export async function expectNoSeriousA11yViolations(page: Page) {
  await waitForFiniteAnimations(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}
