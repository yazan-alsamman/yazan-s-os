import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 3 project intelligence flows on the production build and the isolated test DB. Every
 * record is created by the test through the real API or UI (fixture names, `.invalid` account).
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p3owner");
const DAY = 86_400_000;
const d = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
let projectId = "";
let emptyProjectId = "";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/command-center$/);
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status(), path).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data;
}

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("setup: an account with a real project, technologies, evidence and milestones", async ({
  page,
}) => {
  await signUp(page, owner);
  const ts = await post(page, "/api/v1/technologies", { name: "Fixture TypeScript" });
  const pg = await post(page, "/api/v1/technologies", { name: "Fixture PostgreSQL" });
  const skill = await post(page, "/api/v1/skills", { name: "Fixture: Distributed systems" });
  const e1 = await post(page, "/api/v1/evidence", {
    type: "document",
    title: "Fixture design doc",
    date: d(-20),
    verified: true,
  });
  const e2 = await post(page, "/api/v1/evidence", {
    type: "demo",
    title: "Fixture demo",
    date: d(-5),
  });
  await post(page, "/api/v1/evidence", { type: "other", title: "Fixture unrelated evidence" });
  const p = await post(page, "/api/v1/projects", {
    name: "Fixture Platform",
    status: "development",
    healthStatus: "on_track",
    startDate: d(-200),
    targetDate: d(60),
    technologies: [
      { technologyId: ts.id, usageType: "core" },
      { technologyId: pg.id, usageType: "infrastructure" },
    ],
    evidenceIds: [e1.id, e2.id],
    skillIds: [skill.id],
  });
  projectId = p.id;
  await post(page, "/api/v1/projects", {
    name: "Fixture Shipped API",
    status: "production",
    completedAt: d(-30),
    technologies: [{ technologyId: ts.id, usageType: "supporting" }],
  });
  emptyProjectId = (await post(page, "/api/v1/projects", { name: "Fixture Empty Idea" })).id;
  await post(page, `/api/v1/projects/${projectId}/milestones`, {
    title: "Architecture review",
    dueDate: d(-30),
    status: "completed",
    completedAt: d(-31),
  });
  await post(page, `/api/v1/projects/${projectId}/milestones`, {
    title: "Security review",
    dueDate: d(20),
    status: "blocked",
  });
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the dossier keeps Phase 1 behaviour and shows real relationships", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Fixture Platform" })).toBeVisible();
    const sections = page.getByRole("navigation", { name: "Dossier sections" });
    for (const name of [
      "Overview",
      "Health",
      "Delivery",
      "Engineering context",
      "Evidence",
      "Activity",
    ]) {
      await expect(sections.getByRole("link", { name })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Fixture TypeScript" })).toBeVisible();
    await expect(page.getByText("Also in 1 other project")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Fixture: Distributed systems" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture design doc" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture unrelated evidence" })).toHaveCount(0);
    await expect(
      page
        .getByRole("list", { name: "Project lifecycle" })
        .getByRole("link", { name: /Development \(current stage\)/ }),
    ).toHaveAttribute("aria-current", "step");

    // Phase 1 edit still works.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Impact", exact: true })
      .fill("Fixture impact statement");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Fixture impact statement")).toBeVisible();
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("manual and computed health are distinct, with an explanation per component", async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}#health`);
    await expect(page.getByRole("heading", { name: "Manual health", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Computed health signal" })).toBeVisible();
    await expect(page.getByText("PEOS never changes it")).toBeVisible();
    const table = page.getByRole("table", { name: /Health components/ });
    for (const row of [
      "Schedule",
      "Milestone completion",
      "Blockers",
      "Recent activity",
      "Scope stability",
      "Issue severity",
    ]) {
      await expect(table.getByRole("rowheader", { name: row })).toBeVisible();
    }
    await expect(table.getByRole("row", { name: /Blockers/ })).toContainText(
      "1 of 1 open milestone is blocked.",
    );
    await expect(table.getByRole("row", { name: /Scope stability/ })).toContainText("Unavailable");
    await page.getByRole("button", { name: "How computed health is calculated" }).click();
    await expect(page.getByRole("dialog", { name: "Computed project health" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("create, edit, complete and reopen a milestone; overdue appears", async ({ page }) => {
    await page.goto(`/projects/${projectId}#delivery`);
    const manager = region(page, "Milestones (2)");
    await expect(manager).toBeVisible();
    const milestoneRows = page
      .getByRole("list", { name: "Milestones by planned date" })
      .getByRole("listitem");

    // Create (overdue: planned two days ago).
    await page.getByRole("button", { name: "Add milestone" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Load testing");
    await dialog.getByLabel("Planned date").fill(d(-2));
    await dialog.getByRole("button", { name: "Create milestone" }).click();
    await expect(dialog).toBeHidden();
    const row = milestoneRows.filter({ hasText: "Load testing" });
    await expect(row.getByText("Overdue")).toBeVisible();

    // Edit.
    await page.getByRole("button", { name: "Edit Load testing" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Load testing (k6)");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    const edited = milestoneRows.filter({ hasText: "Load testing (k6)" });
    await expect(edited).toBeVisible();

    // Delivery rate: 1 completed of 2 done or past due → 50%.
    await expect(page.getByText("1 completed of 2 done or past due")).toBeVisible();

    // Complete → no longer overdue; delivery rate 100%.
    await page.getByRole("button", { name: "Mark Load testing (k6) complete" }).click();
    await expect(edited.getByText("Completed", { exact: true })).toBeVisible();
    await expect(edited.getByText("Overdue")).toHaveCount(0);
    await expect(page.getByText("2 completed of 2 done or past due")).toBeVisible();

    // Reopen → overdue again.
    await page.getByRole("button", { name: "Reopen Load testing (k6)" }).click();
    await expect(edited.getByText("Overdue")).toBeVisible();

    // The change history shows in the project activity.
    await page.reload();
    await expect(
      page
        .getByRole("list", { name: "Project activity, newest first" })
        .getByText("Reopened milestone"),
    ).toBeVisible();
  });

  test("project evidence section counts only linked evidence and drills down", async ({ page }) => {
    await page.goto(`/projects/${projectId}#evidence`);
    const summary = page.getByRole("heading", { name: "Evidence summary" }).locator("..");
    await expect(summary.getByRole("link", { name: "2" }).first()).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Project evidence, newest first" }).getByRole("listitem"),
    ).toHaveCount(2);
    await page.getByRole("link", { name: "View all project evidence" }).click();
    await expect(page).toHaveURL(new RegExp(`/evidence\\?projectId=${projectId}`));
    await expect(page.getByRole("link", { name: "Fixture demo" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture unrelated evidence" })).toHaveCount(0);
  });

  test("an empty project is honest: no milestones, no fabricated rate or health", async ({
    page,
  }) => {
    await page.goto(`/projects/${emptyProjectId}`);
    await expect(page.getByText(/No milestones yet/)).toBeVisible();
    await expect(
      page.getByText("No evidence is linked to this project.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("No overall score")).toBeVisible();
    await expect(page.getByText(/at least 2 are needed for an overall score/)).toBeVisible();
    await expect(
      page.getByText("No target date is set, so the schedule cannot be assessed."),
    ).toBeVisible();
  });

  test("portfolio analytics reflect the real records and drill down to filtered lists", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/projects/portfolio");
    const kpi = (name: string) =>
      page.getByRole("link", { name: new RegExp(`^${name}: .*View the records$`) });
    await expect(kpi("Milestones")).toHaveAccessibleName(/: 3\./);
    await expect(kpi("Overdue milestones")).toHaveAccessibleName(/: 1\./);
    await expect(kpi("Blocked milestones")).toHaveAccessibleName(/: 1\./);
    await expect(kpi("Delivery rate")).toHaveAccessibleName(/: 50%\./);
    await expect(page.getByText("1 of 3 projects are in an active stage")).toBeVisible();
    await expectNoAxeViolations(page);

    // KPI → milestones list filtered to overdue.
    await kpi("Overdue milestones").click();
    await expect(page).toHaveURL(/\/projects\/milestones\?overdue=true/);
    await expect(page.getByText("Load testing (k6)").first()).toBeVisible();
    await expect(page.getByText("Security review")).toHaveCount(0);
    await expectNoAxeViolations(page);

    // Technology mapping: data table → projects using the technology.
    await page.goto("/projects/portfolio");
    const tech = region(page, "Technology usage across projects");
    await tech.getByRole("button", { name: "Show data table" }).click();
    await tech.getByRole("link", { name: "Fixture TypeScript" }).click();
    await expect(page).toHaveURL(/\/projects\?technologyId=/);
    await expect(page.getByRole("link", { name: "Fixture Platform" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Shipped API" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Empty Idea" })).toHaveCount(0);

    // Computed health bucket → computed health list.
    await page.goto("/projects/portfolio");
    const computed = region(page, "Computed health");
    await computed.getByRole("button", { name: "Show data table" }).click();
    await computed.getByRole("link", { name: "Insufficient data" }).click();
    await expect(page).toHaveURL(/\/projects\/health\?computed=insufficient_data/);
    await expect(page.getByRole("link", { name: "Fixture Empty Idea" })).toBeVisible();
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("keyboard: add a milestone without a mouse; focus returns to the trigger", async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}#delivery`);
    const add = page.getByRole("button", { name: "Add milestone" });
    await add.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "New milestone" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
    await page.keyboard.type("Keyboard milestone");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();

    // Tab reaches the dossier section links and milestone actions.
    await page
      .getByRole("navigation", { name: "Dossier sections" })
      .getByRole("link", { name: "Overview" })
      .focus();
    const reached = new Set<string>();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      reached.add(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
        }),
      );
    }
    const names = [...reached];
    expect(names).toContain("How computed health is calculated");
    expect(names).toContain("Add milestone");
    expect(names.some((n) => n.startsWith("Edit "))).toBe(true);
  });

  test("dark theme dossier has no accessibility violations", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("heading", { name: "Computed health signal" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 375, height: 740 } });

    test("the dossier and portfolio fit a phone; milestones stay usable", async ({ page }) => {
      for (const path of [`/projects/${projectId}`, "/projects/portfolio"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
      await page.goto(`/projects/${projectId}#delivery`);
      await expect(page.getByRole("button", { name: "Add milestone" })).toBeVisible();
      const title = page
        .getByRole("list", { name: "Milestones by planned date" })
        .getByText("Security review", { exact: true });
      const box = await title.boundingBox();
      expect(box!.width).toBeGreaterThan(60); // not squeezed into one character per line
      await expectNoAxeViolations(page);
    });
  });
});
