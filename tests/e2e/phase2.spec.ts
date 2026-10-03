import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 2 Command Center flows on the production build and the isolated test DB. Every record
 * is created by the test through the real API (fixture names, `.invalid` account) — no seeding.
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p2owner");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

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

/** Fixture records relative to today: 2 active projects, 1 production, dated + undated evidence. */
async function createFixtures(page: Page) {
  const skill = await post(page, "/api/v1/skills", {
    name: "Fixture: Distributed systems",
    category: "Backend",
    targetLevel: 4,
  });
  await post(page, "/api/v1/skills", { name: "Fixture: Rust", category: "Languages" });
  const evidence = [];
  for (const [i, days, verified] of [
    [1, 5, true],
    [2, 40, true],
    [3, 70, false],
    [4, 200, true],
  ] as const) {
    evidence.push(
      await post(page, "/api/v1/evidence", {
        type: "document",
        title: `Fixture evidence ${i}`,
        date: daysAgo(days),
        verified,
      }),
    );
  }
  await post(page, "/api/v1/evidence", { type: "other", title: "Fixture undated evidence" });
  const link = await page.request.put(`/api/v1/skills/${skill.id}/evidence`, {
    data: { evidence: [{ evidenceId: evidence[0]!.id, strength: "strong" }] },
  });
  expect(link.ok()).toBe(true);
  for (const [name, status, healthStatus, completedAt] of [
    ["Fixture Platform", "production", "on_track", daysAgo(30)],
    ["Fixture API", "development", "at_risk", undefined],
    ["Fixture Mobile", "validation", "blocked", undefined],
    ["Fixture Idea", "idea", "not_assessed", undefined],
  ] as const) {
    await post(page, "/api/v1/projects", { name, status, healthStatus, completedAt });
  }
  await post(page, "/api/v1/certifications", {
    name: "Fixture Expiring Cert",
    issuer: "Fixture",
    expiryDate: daysAgo(-30),
  });
  await post(page, "/api/v1/certifications", {
    name: "Fixture Expired Cert",
    issuer: "Fixture",
    expiryDate: daysAgo(10),
  });
}

/** Filter controls, scoped: "Project health" also names a chart region, its image and its info button. */
const filters = (page: Page) => page.getByRole("region", { name: "Command Center filters" });

const kpi = (page: Page, name: string) =>
  page.getByRole("link", { name: new RegExp(`^${name}: .*View the records$`) });

test("a new account sees an honest empty Command Center", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signUp(page, owner);
  await expect(
    page.getByRole("heading", { name: "Your Command Center will populate as you add records" }),
  ).toBeVisible();
  // No numbers are invented: KPIs render "no value" with a reason, not 0.
  await expect(page.getByLabel("Active projects: no value")).toBeVisible();
  await expect(page.getByText("No projects yet.").first()).toBeVisible();
  await expect(kpi(page, "Active projects")).toHaveCount(0);
  await expectNoAxeViolations(page);
  expect(errors).toEqual([]);
});

test.describe("with records", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    await createFixtures(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("KPIs, project health, certifications and skills reflect the real records", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await expect(
      page.getByRole("heading", { name: "Your Command Center will populate as you add records" }),
    ).toHaveCount(0);
    await expect(kpi(page, "Active projects")).toHaveAccessibleName(/: 2\./);
    await expect(kpi(page, "Production systems")).toHaveAccessibleName(/: 1\./);
    await expect(kpi(page, "Evidence items")).toHaveAccessibleName(/: 5\./);
    await expect(kpi(page, "Certifications expiring")).toHaveAccessibleName(/: 1\./);

    const health = page.getByRole("region", { name: "Project health" });
    await expect(health.getByText("2 of 4 projects are at risk or blocked")).toBeVisible();
    await expect(health.getByRole("img", { name: /Bar chart of project health/ })).toBeVisible();

    const certs = page.getByRole("region", { name: "Certification expiry" });
    await expect(certs.getByText(/1 expiring within 90 days, 1 expired/)).toBeVisible();

    const attention = page.getByRole("region", { name: "Needs attention" });
    for (const name of ["Fixture API", "Fixture Mobile", "Fixture Expired Cert"]) {
      await expect(attention.getByText(name)).toBeVisible();
    }

    const skills = page.getByRole("region", { name: "Skill snapshot" });
    await expect(skills.getByText("1 of 2 skills have linked evidence")).toBeVisible();
    await expect(skills.getByRole("link", { name: "Fixture: Distributed systems" })).toBeVisible();

    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("the evidence timeline uses evidence dates and reports undated items", async ({ page }) => {
    const timeline = page.getByRole("region", { name: "Evidence timeline" });
    const items = timeline
      .getByRole("list", { name: "Evidence, newest first" })
      .getByRole("listitem");
    // Default 90-day window: evidence 1–3 (5, 40, 70 days ago); 200 days ago is outside.
    await expect(items).toHaveCount(3);
    await expect(items.first()).toContainText("Fixture evidence 1");
    await expect(
      items.first().getByRole("link", { name: /Fixture: Distributed systems/ }),
    ).toBeVisible();
    await expect(timeline.getByText("Fixture evidence 4")).toHaveCount(0);
    await expect(timeline.getByText(/1 evidence item has no date/)).toBeVisible();
    await timeline.getByRole("link", { name: "Review undated evidence" }).click();
    await expect(page).toHaveURL(/\/evidence\?.*dated=false/);
    await expect(
      page.getByRole("link", { name: "Fixture undated evidence" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture evidence 1" })).toHaveCount(0);
  });

  test("recent activity lists the user's changes with safe labels and links", async ({ page }) => {
    const activity = page.getByRole("region", { name: "Recent activity" });
    await expect(activity.getByText("Created project").first()).toBeVisible();
    await expect(activity.getByRole("link", { name: "Fixture Platform" })).toBeVisible();
    // Relation changes show the record's current name, never a raw id or a placeholder.
    const relation = activity.getByRole("listitem").filter({ hasText: "Changed links of skill" });
    await expect(
      relation.getByRole("link", { name: "Fixture: Distributed systems" }),
    ).toBeVisible();
    await expect(activity).not.toContainText(/sign(ed)? in/i);
  });

  test("a KPI definition opens in a drawer and is keyboard accessible", async ({ page }) => {
    const info = page.getByRole("button", { name: "Definition of Active projects" });
    await info.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Active projects" });
    await expect(drawer).toBeVisible();
    for (const field of ["Formula", "Source", "Frequency", "Owner", "Caveats", "Availability"]) {
      await expect(drawer.getByText(field, { exact: true })).toBeVisible();
    }
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(info).toBeFocused();

    await page.getByRole("link", { name: "Metric definitions" }).click();
    await expect(page).toHaveURL(/\/command-center\/metrics$/);
    // Phase 5 made the goal KPIs available; AI experiments (Phase 6) remain catalogued as unavailable.
    await expect(page.getByText(/Unavailable — Phase 6/).first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("filters live in the URL, survive reload and narrow the widgets", async ({ page }) => {
    await filters(page).getByLabel("Project health").selectOption("blocked");
    await expect(page).toHaveURL(/projectHealth=blocked/);
    await filters(page).getByLabel("Date range").selectOption("365d");
    await expect(page).toHaveURL(/range=365d/);
    await page.reload();
    await expect(filters(page).getByLabel("Project health")).toHaveValue("blocked");
    await expect(filters(page).getByLabel("Date range")).toHaveValue("365d");
    await expect(kpi(page, "Active projects")).toHaveAccessibleName(/: 1\./);
    const timeline = page.getByRole("region", { name: "Evidence timeline" });
    await expect(
      timeline.getByRole("list", { name: "Evidence, newest first" }).getByRole("listitem"),
    ).toHaveCount(4);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/command-center$/);
    await expect(kpi(page, "Active projects")).toHaveAccessibleName(/: 2\./);
  });

  test("drill-down opens filtered lists whose totals match the KPI", async ({ page }) => {
    await kpi(page, "Active projects").click();
    await expect(page).toHaveURL(/\/projects\?.*lifecycle=active/);
    await expect(page.getByText("Also filtered by:")).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture API" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Mobile" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Platform" })).toHaveCount(0);

    // From a chart's data table: health bucket → projects with that health.
    await page.goto("/command-center");
    const health = page.getByRole("region", { name: "Project health" });
    await health.getByRole("button", { name: "Show data table" }).click();
    await health.getByRole("link", { name: "Blocked" }).click();
    await expect(page).toHaveURL(/\/projects\?.*healthStatus=blocked/);
    await expect(page.getByRole("link", { name: "Fixture Mobile" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture API" })).toHaveCount(0);

    await page.goto("/command-center");
    await kpi(page, "Certifications expiring").click();
    await expect(page).toHaveURL(/\/certifications\?.*current=true/);
    await expect(page.getByRole("link", { name: "Fixture Expiring Cert" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Expired Cert" })).toHaveCount(0);
  });

  test("keyboard: filters, KPIs and chart tables are reachable with Tab", async ({ page }) => {
    await filters(page).getByLabel("Date range").focus();
    const reached = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
      });
      reached.add(name);
    }
    const names = [...reached];
    expect(names.some((n) => n.startsWith("Active projects:"))).toBe(true);
    expect(names).toContain("Definition of Active projects");
    expect(names.some((n) => n.includes("Show data table"))).toBe(true);
  });

  test("dark theme renders without accessibility violations", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/settings");
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.goto("/command-center");
    await expect(kpi(page, "Active projects")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(errors).toEqual([]);
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 375, height: 740 } });

    test("the Command Center fits a phone without horizontal scrolling", async ({ page }) => {
      await expect(kpi(page, "Active projects")).toBeVisible();
      await expect(page.getByRole("region", { name: "Recent activity" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await expectNoAxeViolations(page);
    });
  });
});
