import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 8 AI Copilot on the production build and the isolated test DB. No AI provider is
 * configured in CI, so the assistant runs in deterministic retrieval-only mode and cites every
 * record — no network, no flakiness. All data is created by the test through the real API.
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p8owner");

async function api(page: Page, method: string, path: string, data?: unknown) {
  const response = await page.request.fetch(path, { method, data });
  expect(response.ok(), `${method} ${path}`).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

test("setup: an account with a project and verified evidence", async ({ page }) => {
  await signUp(page, owner);
  await api(page, "POST", "/api/v1/projects", { name: "Fixture Copilot Platform" });
  await api(page, "POST", "/api/v1/evidence", {
    type: "production_metric",
    title: "Fixture launch metrics",
  });
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/command-center$/);
  });

  test("answers a suggested prompt with a cited, retrieval-only answer", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/copilot");
    await expect(page.getByRole("heading", { name: "AI Copilot", level: 1 })).toBeVisible();

    // Retrieval-only notice is shown when no model is configured.
    await expect(page.getByText(/answers are assembled directly from your records/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Project delivery" }).click();

    // A grounded assistant answer appears, labelled retrieval-only, with its data lookups.
    await expect(page.getByText("Retrieval only").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Show data lookups/ })).toBeVisible();

    // The conversation is now listed in the sidebar.
    await expect(
      page.getByRole("complementary", { name: "Conversations" }).getByRole("button"),
    ).not.toHaveCount(1); // "New conversation" + at least one conversation row

    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("answers a typed follow-up question", async ({ page }) => {
    await page.goto("/copilot");
    await page
      .getByRole("textbox", { name: /Ask a question/i })
      .fill("What verified evidence do I have?");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByText("Retrieval only").first()).toBeVisible({ timeout: 15_000 });
    // The question is echoed back (in the transcript and as the conversation title).
    await expect(page.getByText("What verified evidence do I have?").first()).toBeVisible();
  });
});
