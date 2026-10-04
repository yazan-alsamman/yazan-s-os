import { expect, test } from "@playwright/test";

import {
  collectConsoleErrors,
  createFromList,
  expectNoAxeViolations,
  newAccount,
  pickRelations,
  signUp,
} from "./helpers";

/**
 * Phase 10 — Evidence Vault & Opportunities. Drives the real production build: create an opportunity,
 * add a structured requirement, map owned evidence, and see a transparent fit (unverified evidence is
 * "partial", never "supported"), plus the evidence portfolio. Axe-clean across the new surfaces.
 */
test.describe.configure({ mode: "serial" });
const owner = newAccount("p10owner");

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

  test("opportunities are a first-class area with transparent, non-fabricated fit", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    // Empty state first — never fabricated listings.
    await page.goto("/opportunities");
    await expect(page.getByRole("heading", { name: "Opportunities", level: 1 })).toBeVisible();
    await expect(page.getByText("No opportunities yet.")).toBeVisible({ timeout: 15_000 });
    await expectNoAxeViolations(page);

    // Create an opportunity.
    await createFromList(page, "/opportunities", "New opportunity", {
      Title: "E2E Staff Engineer",
      Organization: "E2E Corp",
    });
    await page.getByRole("link", { name: "E2E Staff Engineer" }).click();
    await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+$/);

    // Add a required requirement → it is "Missing" and required coverage is 0%.
    await page.getByRole("button", { name: "Add requirement" }).click();
    const reqDialog = page.getByRole("dialog");
    await reqDialog
      .getByRole("textbox", { name: "Requirement", exact: true })
      .fill("Advanced PostgreSQL");
    await reqDialog.getByRole("button", { name: "Add requirement" }).click();
    await expect(reqDialog).toBeHidden();

    await expect(page.getByText("Advanced PostgreSQL")).toBeVisible();
    await expect(page.getByText("Required · missing")).toBeVisible();
    await expectNoAxeViolations(page);

    // Create an (unverified) evidence item, then map it to the requirement.
    await createFromList(page, "/evidence", "New evidence item", {
      Title: "E2E PostgreSQL migration",
    });
    await page.goto("/opportunities");
    await page.getByRole("link", { name: "E2E Staff Engineer" }).click();

    await pickRelations(page, "Map evidence", [{ label: "E2E PostgreSQL migration" }]);
    // Unverified evidence makes the requirement "Partial" — it is never counted as supported.
    await expect(page.getByText("Partial", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Portfolio export uses real data only.
    await page.getByRole("link", { name: "Evidence portfolio" }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByRole("heading", { name: "E2E Staff Engineer" })).toBeVisible();
    await expect(page.getByText("E2E PostgreSQL migration")).toBeVisible();
    await expectNoAxeViolations(page);

    // Evidence Vault itself remains axe-clean with the new provenance.
    await page.goto("/evidence");
    await expect(page.getByRole("link", { name: "E2E PostgreSQL migration" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expectNoAxeViolations(page);

    expect(
      errors.filter((e) => !/40(9|1|4)|Conflict|Unauthorized|Failed to load resource/i.test(e)),
    ).toEqual([]);
  });
});
