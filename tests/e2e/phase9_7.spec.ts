import { expect, test } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 9.7 GitHub Intelligence Expansion on the production build. No GitHub OAuth app is configured
 * in CI, so every new GitHub surface (activity, pull requests, issues, releases, contributors,
 * compare) renders the honest "GitHub is not connected." state — never fabricated PRs, issues,
 * releases or contributors — with the section sub-navigation present and axe clean.
 */
test.describe.configure({ mode: "serial" });
const owner = newAccount("p97owner");

const NOT_CONNECTED_SURFACES = [
  "/github/activity",
  "/github/pull-requests",
  "/github/issues",
  "/github/releases",
  "/github/contributors",
  "/github/compare",
];

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

  test("new GitHub surfaces render honest not-connected states with sub-navigation", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/github/pull-requests");
    // Section sub-navigation is present across the GitHub area.
    await expect(
      page.getByRole("navigation", { name: "GitHub sections" }).getByRole("link", {
        name: "Pull Requests",
      }),
    ).toBeVisible();

    for (const path of NOT_CONNECTED_SURFACES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "GitHub is not connected." })).toBeVisible({
        timeout: 15_000,
      });
    }

    await expectNoAxeViolations(page);
    // The not-connected API calls legitimately return 409 (and sync-status 401/409); the browser
    // logs those as resource errors. Only real application errors should fail the test.
    expect(
      errors.filter((e) => !/40(9|1)|Conflict|Unauthorized|Failed to load resource/i.test(e)),
    ).toEqual([]);
  });
});
