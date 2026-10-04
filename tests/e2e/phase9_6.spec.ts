import { expect, test } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 9.6 GitHub Repository Intelligence on the production build. No GitHub OAuth app is configured
 * in CI, so the honest "GitHub is not connected" states render across the dedicated GitHub area
 * (never fake repositories/commits), with axe clean.
 */
test.describe.configure({ mode: "serial" });
const owner = newAccount("p96owner");

test("setup: an account", async ({ page }) => {
  await signUp(page, owner);
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/command-center$/);
  });

  test("GitHub is a top-level area with honest not-connected states", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    // Dedicated top-level nav entry.
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "GitHub" }),
    ).toBeVisible();

    await page.goto("/github");
    await expect(page.getByRole("heading", { name: "GitHub", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitHub is not connected." })).toBeVisible({
      timeout: 15_000,
    });

    for (const path of ["/github/repositories", "/github/analytics"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "GitHub is not connected." })).toBeVisible({
        timeout: 15_000,
      });
    }

    await expectNoAxeViolations(page);
    // The not-connected API calls legitimately return 409; the browser logs those as resource
    // errors. Only real application errors should fail the test.
    expect(
      errors.filter((e) => !/40(9|1)|Conflict|Unauthorized|Failed to load resource/i.test(e)),
    ).toEqual([]);
  });
});
