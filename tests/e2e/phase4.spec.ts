import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 4 skills & career intelligence on the production build and the isolated test DB.
 * Every record is created by the test through the real API or UI (fixture names only).
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p4owner");
const intruder = newAccount("p4intruder");
const DAY = 86_400_000;
const d = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const ids: Record<string, string> = {};

async function signIn(page: Page, account = owner) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/command-center$/);
}

async function api(page: Page, method: string, path: string, data?: unknown) {
  const response = await page.request.fetch(path, { method, data });
  expect(response.ok(), `${method} ${path}`).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("setup: real skills, evidence, projects, technologies and certifications", async ({
  page,
  browser,
}) => {
  await signUp(page, owner);
  const skill = (b: object) => api(page, "POST", "/api/v1/skills", b);
  const ev = (b: object) => api(page, "POST", "/api/v1/evidence", { type: "document", ...b });
  ids.ts = (await skill({ name: "Fixture TypeScript", category: "Languages", targetLevel: 4 })).id;
  ids.k8s = (await skill({ name: "Fixture Kubernetes", category: "Platform", targetLevel: 4 })).id;
  ids.sql = (await skill({ name: "Fixture SQL", category: "Languages", targetLevel: 3 })).id;
  ids.aws = (await skill({ name: "Fixture AWS", category: "Platform" })).id;
  const e1 = await ev({ title: "Fixture API design doc", date: d(-20), verified: true });
  const e2 = await ev({
    title: "Fixture latency dashboard",
    type: "production_metric",
    date: d(-60),
    verified: true,
  });
  const e3 = await ev({ title: "Fixture code review", date: d(-200) });
  const e4 = await ev({ title: "Fixture old SQL report", date: d(-1100), verified: true });
  await api(page, "PUT", `/api/v1/skills/${ids.ts}/evidence`, {
    evidence: [
      { evidenceId: e1.id, strength: "strong" },
      { evidenceId: e2.id, strength: "moderate" },
      { evidenceId: e3.id, strength: "moderate" },
    ],
  });
  await api(page, "PUT", `/api/v1/skills/${ids.sql}/evidence`, {
    evidence: [{ evidenceId: e4.id, strength: "moderate" }],
  });
  ids.node = (await api(page, "POST", "/api/v1/technologies", { name: "Fixture Node.js" })).id;
  ids.project = (
    await api(page, "POST", "/api/v1/projects", {
      name: "Fixture Platform",
      status: "production",
      skillIds: [ids.ts],
      technologies: [{ technologyId: ids.node, usageType: "core" }],
    })
  ).id;
  const cert = await api(page, "POST", "/api/v1/certifications", {
    name: "Fixture AWS SAA",
    issuer: "AWS",
  });
  await api(page, "PUT", `/api/v1/certifications/${cert.id}/skills`, { skillIds: [ids.aws] });
  const other = await browser.newContext();
  await signUp(await other.newPage(), intruder);
  await other.close();
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the Skills page still works; a target level can be created and edited", async ({
    page,
  }) => {
    await page.goto("/skills");
    await expect(page.getByRole("link", { name: "Fixture TypeScript" }).first()).toBeVisible();
    await page.getByRole("button", { name: "New skill" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Fixture GraphQL");
    await dialog.getByRole("combobox", { name: "Target level" }).selectOption("2");
    await dialog.getByRole("button", { name: /^Create / }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name: "Fixture GraphQL" }).first().click();
    await expect(page.getByText("Target: Working knowledge")).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Target level" }).selectOption("3");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Target: Independent")).toBeVisible();
    // No evidence → explicit missing-data state, not 0.
    const intel = region(page, "Skill intelligence");
    await expect(intel.getByText("Not enough evidence", { exact: true })).toBeVisible();
    await expect(intel.getByText("Not computable", { exact: true })).toBeVisible();
  });

  test("the dossier shows the derived level, its explanation and every supporting record", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/skills/${ids.ts}`);
    const intel = region(page, "Skill intelligence");
    await expect(intel.getByText("4 — Advanced").first()).toBeVisible();
    await expect(intel.getByText("At target", { exact: true })).toBeVisible();
    await expect(intel.getByText(/Highest level whose evidence rules all hold: 4/)).toBeVisible();
    const rules = page.getByRole("table", { name: /Evidence rules per level/ });
    await expect(rules.getByRole("rowheader", { name: /5 — Expert/ })).toContainText(
      "rule not met",
    );
    const evidence = page.getByRole("list", { name: "Skill evidence, newest demonstration first" });
    await expect(evidence.getByRole("listitem")).toHaveCount(3);
    await expect(evidence.getByRole("listitem").first()).toContainText("Fixture API design doc");
    await expect(page.getByRole("heading", { name: "Projects (1)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Platform" })).toBeVisible();
    await expect(
      region(page, "Technologies").getByRole("link", { name: /Fixture Node\.js/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("explicit technology links and certification contribution are visible", async ({ page }) => {
    await page.goto(`/skills/${ids.ts}`);
    const add = page.getByRole("button", { name: "Manage technologies" });
    await add.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Fixture Node.js" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page
        .getByRole("list", { name: "Linked technologies" })
        .getByRole("link", { name: "Fixture Node.js" }),
    ).toBeVisible();

    await page.goto(`/skills/${ids.aws}`);
    await expect(page.getByRole("heading", { name: "Certifications (1)" })).toBeVisible();
    await expect(
      page.getByText(/Certifications cap the derived level at Working knowledge/),
    ).toBeVisible();
    await expect(
      region(page, "Skill intelligence").getByText("2 — Working knowledge"),
    ).toBeVisible();
  });

  test("missing evidence and stale freshness are explicit states", async ({ page }) => {
    await page.goto(`/skills/${ids.k8s}`);
    const k8s = region(page, "Skill intelligence");
    await expect(k8s.getByText("Not enough evidence", { exact: true })).toBeVisible();
    await expect(k8s.getByText("Not computable", { exact: true })).toBeVisible();
    await expect(k8s.getByText("No evidence", { exact: true })).toBeVisible();

    await page.goto(`/skills/${ids.sql}`);
    const sql = region(page, "Skill intelligence");
    await expect(sql.getByText("Stale", { exact: true })).toBeVisible();
    await expect(sql.getByText("Critical gap", { exact: true })).toBeVisible();
    // The freshness fact shows the date; the explanation shows the day count and the rule.
    await expect(sql.getByText(/^Last demonstrated [A-Z]/)).toBeVisible();
    await expect(sql.getByText(/days ago\): stale/)).toBeVisible();
  });

  test("radar, distributions and heatmap show real data with table alternatives", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/skills/intelligence");
    const kpi = (name: string) =>
      page.getByRole("link", { name: new RegExp(`^${name}: .*View the records$`) });
    await expect(kpi("Skill coverage")).toHaveAccessibleName(/: 25%\./); // 1 of 4 target skills fresh
    await expect(kpi("Critical skill gaps")).toHaveAccessibleName(/: 1\./);

    const radar = region(page, "Skill radar");
    await expect(
      radar.getByRole("img", { name: /Radar chart of evidence-derived levels/ }),
    ).toBeVisible();
    await expect(
      radar.getByText(/without an evidence-derived level \(.*Fixture Kubernetes/),
    ).toBeVisible();
    await radar.getByRole("button", { name: "Show data table" }).click();
    await expect(radar.getByRole("link", { name: "Fixture TypeScript" })).toBeVisible();

    const heatmap = region(page, "Skill gap heatmap");
    const table = heatmap.getByRole("table");
    await expect(table.getByRole("row", { name: /Fixture SQL/ })).toContainText("1 below");
    await expect(table.getByRole("row", { name: /Fixture SQL/ })).toContainText("Critical");
    await expect(table.getByRole("row", { name: /Fixture Kubernetes/ })).toContainText(
      "Not enough evidence",
    );
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("heatmap filters persist in the URL; KPI drill-down reaches the exact list", async ({
    page,
  }) => {
    await page.goto("/skills/intelligence");
    const heatmap = region(page, "Skill gap heatmap");
    await heatmap.getByLabel("Freshness").selectOption("stale");
    await expect(page).toHaveURL(/freshness=stale/);
    await page.reload();
    await expect(region(page, "Skill gap heatmap").getByLabel("Freshness")).toHaveValue("stale");
    const rows = region(page, "Skill gap heatmap").getByRole("table").getByRole("rowheader");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Fixture SQL");

    await page.goto("/skills/intelligence");
    await page.getByRole("link", { name: /^Critical skill gaps: .*View the records$/ }).click();
    await expect(page).toHaveURL(/\/skills\/intelligence\?active=true&critical=true/);
    await expect(
      region(page, "Skill gap heatmap").getByRole("table").getByRole("rowheader"),
    ).toHaveCount(1);
  });

  test("the career graph shows real relationships, with a list alternative and drill-down", async ({
    page,
  }) => {
    await page.goto("/skills/graph");
    await expect(
      page.getByRole("img", { name: /Network graph of \d+ career records/ }),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Career graph records" });
    await expect(
      list
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Fixture Platform", exact: true }) }),
    ).toContainText("Fixture TypeScript");
    await list.getByRole("button", { name: "Focus the graph on Fixture Platform" }).click();
    await expect(page).toHaveURL(/focusType=project/);
    await expect(page.getByText(/Focused on/)).toBeVisible();
    await expectNoAxeViolations(page);
    await page
      .getByRole("list", { name: "Career graph records" })
      .getByRole("link", { name: "Fixture TypeScript" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/skills/${ids.ts}$`));
  });

  test("custom level model names apply to a skill without changing its evidence rules", async ({
    page,
  }) => {
    await page.goto("/skills/level-models");
    await page.getByRole("button", { name: "New level model" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Model name", exact: true }).fill("Fixture tiers");
    await dialog.getByRole("textbox", { name: "Level 4 name", exact: true }).fill("Fixture senior");
    await dialog.getByRole("button", { name: "Create level model" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Fixture tiers" })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(`/skills/${ids.ts}`);
    await page.getByLabel(/Level model/).selectOption({ label: "Fixture tiers" });
    await expect(
      region(page, "Skill intelligence").getByText("4 — Fixture senior").first(),
    ).toBeVisible();
    await page.getByLabel(/Level model/).selectOption({ label: "PEOS default (0–5)" });
    await expect(
      region(page, "Skill intelligence").getByText("4 — Advanced").first(),
    ).toBeVisible();
  });

  test("Command Center skill KPIs use the Phase 4 intelligence; Phase 3 is unchanged", async ({
    page,
  }) => {
    await page.goto("/command-center");
    const kpi = (name: string) =>
      page.getByRole("link", { name: new RegExp(`^${name}: .*View the records$`) });
    await expect(kpi("Skill coverage")).toHaveAccessibleName(/: 25%\./); // same value as Skills → Intelligence
    await expect(kpi("Critical skill gaps")).toHaveAccessibleName(/: 1\./);
    await kpi("Critical skill gaps").click();
    await expect(page).toHaveURL(/\/skills\/intelligence\?active=true&critical=true/);

    await page.goto(`/projects/${ids.project}`);
    await expect(page.getByRole("heading", { name: "Computed health signal" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Manual health", exact: true })).toBeVisible();
  });

  test("keyboard: filters, definitions and dialogs work without a mouse", async ({ page }) => {
    await page.goto(`/skills/${ids.ts}`);
    const info = page.getByRole("button", { name: "How the skill level is derived" });
    await info.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Evidence-derived skill level" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(info).toBeFocused();

    const manage = page.getByRole("button", { name: "Manage evidence" });
    await manage.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(manage).toBeFocused();

    await page.goto("/skills/intelligence");
    const freshness = region(page, "Skill gap heatmap").getByLabel("Freshness");
    await freshness.focus();
    await page.keyboard.press("ArrowDown"); // native select: keyboard changes the value
    await expect(page).toHaveURL(/freshness=/);
  });

  test("dark theme has no accessibility violations", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.goto("/skills/intelligence");
    await expect(region(page, "Skill gap heatmap")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 375, height: 740 } });

    test("intelligence, dossier and graph fit a phone", async ({ page }) => {
      for (const path of ["/skills/intelligence", `/skills/${ids.ts}`, "/skills/graph"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
      await page.goto("/skills/intelligence");
      await expect(
        page.getByRole("list", { name: "Skill gaps" }).getByText("Fixture SQL"),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
});

test("cross-user access to skill intelligence is blocked", async ({ page }) => {
  await signIn(page, intruder);
  await page.goto(`/skills/${ids.ts}`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  const api = await page.request.get(`/api/v1/skills/${ids.ts}/intelligence`);
  expect(api.status()).toBe(404);
  const graph = await page.request.get(
    `/api/v1/analytics/career-graph?focusType=skill&focusId=${ids.ts}`,
  );
  expect(graph.status()).toBe(404);
  await page.goto("/skills/intelligence");
  await expect(page.getByText("Fixture TypeScript")).toHaveCount(0);
});
