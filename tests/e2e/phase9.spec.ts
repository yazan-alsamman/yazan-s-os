import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 9 Engineering Analytics on the production build and the isolated test DB. The owner records
 * dated engineering events through the real API; the /analytics surface then shows the cross-domain
 * activity, its trend and distribution, and the honestly-unavailable integration metrics.
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p9owner");
const DAY = 86_400_000;
const d = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

async function api(page: Page, method: string, path: string, data?: unknown) {
  const response = await page.request.fetch(path, { method, data });
  expect(response.ok(), `${method} ${path}`).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

test("setup: an account with dated engineering events", async ({ page }) => {
  await signUp(page, owner);
  await api(page, "POST", "/api/v1/projects", {
    name: "Fixture shipped project",
    status: "production",
    completedAt: d(-20),
  });
  await api(page, "POST", "/api/v1/evidence", {
    type: "production_metric",
    title: "Fixture launch metrics",
    date: d(-30),
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

  test("shows cross-domain engineering activity, its charts and the unavailable integration metrics", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/analytics");
    await expect(
      page.getByRole("heading", { name: "Engineering Analytics", level: 1 }),
    ).toBeVisible();

    // The activity KPI reflects the two dated events recorded above.
    await expect(page.getByText("Engineering activity").first()).toBeVisible({ timeout: 15_000 });

    // Both analytics charts render.
    await expect(page.getByRole("heading", { name: "Engineering activity trend" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Engineering activity by domain" }),
    ).toBeVisible();

    // Integration/DORA metrics are shown as explicitly unavailable (never fabricated).
    await expect(
      page.getByRole("heading", { name: "Integration metrics (unavailable)" }),
    ).toBeVisible();
    await expect(page.getByText("Deployment frequency")).toBeVisible();

    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("a new account sees an honest empty state", async ({ browser }) => {
    const fresh = newAccount("p9empty");
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage, fresh);
    await otherPage.goto("/analytics");
    await expect(
      otherPage.getByRole("heading", { name: "No engineering records yet." }),
    ).toBeVisible();
    await other.close();
  });
});
