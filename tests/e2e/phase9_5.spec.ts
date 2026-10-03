import { expect, test } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 9.5 Integration Platform on the production build. No provider OAuth apps are configured in
 * CI, so the honest "not configured / not connected" states are what render — never fake data. The
 * connector registry, settings UI and GitHub explorer states are exercised with axe.
 */
test.describe.configure({ mode: "serial" });
const owner = newAccount("p95owner");

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

  test("integration settings show connectors with honest, unconnected states", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/settings/integrations");
    await expect(page.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();

    // Both connectors are listed; GitHub is not configured in CI, Google is scaffolded.
    await expect(page.getByRole("heading", { name: "GitHub", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Google", level: 3 })).toBeVisible();
    // No fake connection / no fake data.
    await expect(page.getByText("Not configured").first()).toBeVisible();

    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("the GitHub explorer shows a not-connected state (no fake repositories)", async ({
    page,
  }) => {
    await page.goto("/settings/integrations/github");
    await expect(page.getByRole("heading", { name: "GitHub", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitHub is not connected." })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoAxeViolations(page);
  });
});
