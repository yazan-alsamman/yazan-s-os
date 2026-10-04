import { expect, test } from "@playwright/test";

import { createFromList, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 11 — Premium UX / Polish. Exercises the new cross-cutting UX: the command palette (open,
 * create action, recently-viewed), owner-scoped saved views on a list surface, and axe-clean key
 * surfaces (command center, a list, and the open palette dialog).
 */
test.describe.configure({ mode: "serial" });
const owner = newAccount("p11owner");

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

  test("command palette: create action and recently-viewed", async ({ page }) => {
    // Create a project, then open its detail so it becomes "recently viewed".
    await createFromList(page, "/projects", "New project", { Name: "E2E Palette Project" });
    await page.getByRole("link", { name: "E2E Palette Project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
    // Wait for the detail to render so the recently-viewed recorder has run.
    await expect(
      page.getByRole("heading", { name: "E2E Palette Project", level: 1 }),
    ).toBeVisible();

    // Open the palette with the keyboard and confirm recently-viewed + a working create action.
    await page.goto("/command-center");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByText("Recently viewed")).toBeVisible();
    await expect(palette.getByText("E2E Palette Project")).toBeVisible();
    await expectNoAxeViolations(page);

    // A create command deep-links to the list with the create dialog already open.
    await palette.getByText("Create evidence").click();
    await expect(page).toHaveURL(/\/evidence/);
    await expect(page.getByRole("dialog", { name: "New evidence item" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("saved views persist and re-apply filters", async ({ page }) => {
    await page.goto("/projects");
    // Apply a filter, then save the current view.
    await page.getByRole("combobox", { name: "Status" }).selectOption("idea");
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.getByRole("menuitem", { name: /Save current view/ }).click();
    const dialog = page.getByRole("dialog", { name: "Save view" });
    await dialog.getByLabel("View name").fill("Active work");
    await dialog.getByRole("button", { name: "Save view" }).click();
    await expect(dialog).toBeHidden();

    // Clear the filter, then re-apply the saved view.
    await page.getByRole("combobox", { name: "Status" }).selectOption("");
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("");
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.getByRole("menuitem", { name: "Active work" }).click();
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("idea");

    await expectNoAxeViolations(page);
  });
});
