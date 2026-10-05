import { expect, test } from "@playwright/test";

import { expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 13 — Continuous Intelligence. The Intelligence Center loads with honest empty states for a
 * new account, the deterministic detection run works, the weekly executive review renders, and the
 * surface is axe-clean. No fabricated signals appear for an account with no data.
 */
test.describe.configure({ mode: "serial" });
const owner = newAccount("p13owner");

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

  test("intelligence center: run detection, weekly review, honest empty states", async ({
    page,
  }) => {
    // Nav entry is present and available.
    await expect(
      page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Intelligence", exact: true }),
    ).toBeVisible();

    await page.goto("/intelligence");
    await expect(
      page.getByRole("heading", { name: "Continuous Intelligence", level: 1 }),
    ).toBeVisible();

    // Weekly executive review renders (generated deterministically for the current week).
    await expect(page.getByRole("heading", { name: /Weekly executive review/ })).toBeVisible({
      timeout: 15_000,
    });

    // No fabricated signals for a data-less account.
    await expect(page.getByText(/No active signals/)).toBeVisible({ timeout: 15_000 });

    // Deterministic detection run completes without error.
    await page.getByRole("button", { name: "Run detection" }).click();
    await expect(page.getByRole("button", { name: "Run detection" })).toBeEnabled({
      timeout: 15_000,
    });
    await expect(page.getByText(/No active signals/)).toBeVisible();

    await expectNoAxeViolations(page);
  });
});
