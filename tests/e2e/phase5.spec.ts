import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 5 goals & roadmap on the production build and the isolated test DB. Every record is
 * created by the test through the real API or UI (fixture names only). Numbers in test titles map
 * to the 24 required E2E flows.
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p5owner");
const intruder = newAccount("p5intruder");
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

const region = (page: Page, name: string | RegExp) =>
  page.getByRole("region", { name, exact: typeof name === "string" });
const kpi = (page: Page, name: string) =>
  page.getByRole("link", { name: new RegExp(`^${name}: .*View the records$`) });

test("setup: real skills, a project with milestones, and a goal hierarchy", async ({
  page,
  browser,
}) => {
  await signUp(page, owner);
  ids.skill = (
    await api(page, "POST", "/api/v1/skills", { name: "Fixture Go", targetLevel: 3 })
  ).id;
  const ev = await api(page, "POST", "/api/v1/evidence", {
    type: "document",
    title: "Fixture Go service write-up",
    date: d(-30),
    verified: true,
  });
  await api(page, "PUT", `/api/v1/skills/${ids.skill}/evidence`, {
    evidence: [{ evidenceId: ev.id, strength: "strong" }],
  });
  ids.project = (
    await api(page, "POST", "/api/v1/projects", {
      name: "Fixture Goal Platform",
      status: "development",
    })
  ).id;
  ids.mDone = (
    await api(page, "POST", `/api/v1/projects/${ids.project}/milestones`, {
      title: "Fixture milestone shipped",
      status: "completed",
      dueDate: d(-40),
      completedAt: d(-35),
    })
  ).id;
  ids.mLate = (
    await api(page, "POST", `/api/v1/projects/${ids.project}/milestones`, {
      title: "Fixture milestone late",
      status: "planned",
      dueDate: d(-5),
    })
  ).id;
  ids.northStar = (
    await api(page, "POST", "/api/v1/goals", {
      title: "Fixture North Star",
      type: "north_star",
      status: "active",
    })
  ).id;
  ids.annual = (
    await api(page, "POST", "/api/v1/goals", {
      title: "Fixture Annual latency",
      type: "annual_objective",
      parentId: ids.northStar,
      status: "active",
      metric: "p95 latency",
      unit: "ms",
      deadline: d(120),
    })
  ).id;
  ids.overdue = (
    await api(page, "POST", "/api/v1/goals", {
      title: "Fixture Quarterly overdue",
      type: "quarterly_goal",
      parentId: ids.annual,
      status: "active",
      deadline: d(-3),
    })
  ).id;
  ids.draft = (
    await api(page, "POST", "/api/v1/goals", {
      title: "Fixture Draft idea",
      type: "quarterly_goal",
    })
  ).id;
  const other = await browser.newContext();
  await signUp(await other.newPage(), intruder);
  await other.close();
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("1, 2: the goal list works and a goal can be created", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Goals", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Annual latency" }).first()).toBeVisible();
    await page.getByRole("button", { name: "New goal" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Fixture Created goal");
    await dialog
      .getByRole("combobox", { name: "Level", exact: true })
      .selectOption("quarterly_goal");
    await dialog.getByRole("combobox", { name: "Status", exact: true }).selectOption("active");
    await dialog.getByLabel("Deadline", { exact: true }).fill(d(60));
    await dialog.getByRole("button", { name: "Create goal" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "Fixture Created goal" }).first()).toBeVisible();
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("3, 11: editing sets a typed target; a measurement yields explained attainment", async ({
    page,
  }) => {
    await page.goto(`/goals/${ids.annual}`);
    const measurements = region(page, /^Measurements/);
    await expect(measurements.getByRole("button", { name: "Add measurement" })).toBeDisabled();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("spinbutton", { name: "Baseline", exact: true }).fill("200");
    await dialog.getByRole("spinbutton", { name: "Target", exact: true }).fill("100");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("200 → 100 ms")).toBeVisible();

    const progress = region(page, "Progress");
    await expect(progress.getByText("No measurement is recorded yet.")).toBeVisible();
    await measurements.getByRole("button", { name: "Add measurement" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("spinbutton", { name: "Value", exact: true }).fill("150");
    await dialog.getByRole("textbox", { name: "Note", exact: true }).fill("Fixture reading");
    await dialog.getByRole("button", { name: "Add measurement" }).click();
    await expect(dialog).toBeHidden();
    // Lower is better: (150 − 200) / (100 − 200) = 50 %.
    await expect(progress.getByText("In progress · 50%")).toBeVisible();
    await expect(progress.getByText(/50% of the way from 200 ms to 100 ms/)).toBeVisible();
    await expect(
      region(page, "Goal burndown").getByRole("img", { name: /Line chart of 1 recorded/ }),
    ).toBeVisible();
  });

  test("4, 7, 8, 9, 10: the dossier links skills, projects and milestones with derived progress", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/goals/${ids.annual}`);
    await page.getByRole("button", { name: "Manage skills" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Fixture Go" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const skills = region(page, /^Skills \(1\)/);
    await expect(skills.getByRole("rowheader", { name: "Fixture Go" })).toBeVisible();

    await page.getByRole("button", { name: "Manage projects" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Fixture Goal Platform" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      region(page, /^Projects \(1\)/).getByRole("link", { name: "Fixture Goal Platform" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Manage milestones" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: /Fixture milestone shipped/ }).check();
    await dialog.getByRole("checkbox", { name: /Fixture milestone late/ }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const milestones = region(page, /^Milestones \(2\)/);
    await expect(milestones.getByText("Overdue", { exact: true })).toBeVisible();
    const progress = region(page, "Progress");
    await expect(progress.getByText("1 of 2 completed")).toBeVisible();
    await expect(progress.getByText(/50% of linked milestones · 1 overdue/)).toBeVisible();
    // The overdue milestone is a real, listed risk signal.
    await expect(page.getByRole("list", { name: "Risk signals" })).toContainText(
      "Overdue linked milestones (1)",
    );
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("23: goal skill rows equal the Phase 4 skill intelligence", async ({ page }) => {
    await page.goto(`/skills/${ids.skill}`);
    const intel = region(page, "Skill intelligence");
    const level = (await intel
      .getByText(/^\d — /)
      .first()
      .textContent())!.trim();
    await page.goto(`/goals/${ids.annual}`);
    const row = region(page, /^Skills \(1\)/).getByRole("row", { name: /Fixture Go/ });
    await expect(row).toContainText(level);
  });

  test("5: lifecycle transitions follow the table, with completion separate from progress", async ({
    page,
  }) => {
    await page.goto(`/goals/${ids.draft}`);
    const actions = page.getByRole("group", { name: "Lifecycle actions" });
    await expect(actions.getByRole("button")).toHaveText(["Activate", "Cancel goal"]);
    await actions.getByRole("button", { name: "Activate" }).click();
    await expect(actions.getByRole("button", { name: "Mark completed" })).toBeVisible();
    await actions.getByRole("button", { name: "Mark completed" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark goal completed" });
    await dialog.getByRole("button", { name: "Mark completed" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Completed [A-Z]/).first()).toBeVisible();
    // Completion does not invent attainment.
    await expect(
      region(page, "Progress").getByText("Not computable", { exact: true }),
    ).toBeVisible();
    await actions.getByRole("button", { name: "Reopen" }).click();
    await expect(actions.getByRole("button", { name: "Put on hold" })).toBeVisible();
    await actions.getByRole("button", { name: "Cancel goal" }).click();
    await expect(actions.getByRole("button")).toHaveText(["Restore as draft", "Activate"]);
    await actions.getByRole("button", { name: "Restore as draft" }).click();
    await expect(actions.getByRole("button", { name: "Activate" })).toBeVisible();
  });

  test("6: hierarchy — child goals, parent links and level rules", async ({ page }) => {
    await page.goto(`/goals/${ids.northStar}`);
    const hierarchy = region(page, "Hierarchy");
    await expect(hierarchy.getByText("A North Star is the top level.")).toBeVisible();
    await expect(hierarchy.getByRole("link", { name: "Fixture Annual latency" })).toBeVisible();
    await hierarchy.getByRole("button", { name: "Add child goal" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("combobox", { name: "Level", exact: true }).locator("option"),
    ).toHaveText(["Annual objective", "Quarterly goal"]);
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Fixture Child objective");
    await dialog.getByRole("button", { name: "Create child goal" }).click();
    await expect(dialog).toBeHidden();
    await expect(hierarchy.getByRole("heading", { name: "Children (2)" })).toBeVisible();
    await hierarchy.getByRole("link", { name: "Fixture Child objective" }).click();
    await expect(
      region(page, "Hierarchy").getByRole("link", { name: "Fixture North Star" }),
    ).toBeVisible();
    // A goal with children cannot be deleted (no orphaned hierarchy).
    await page.goto(`/goals/${ids.northStar}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm.getByRole("alert")).toContainText("child goals");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
  });

  test("16: missing data is explicit, never zero", async ({ page }) => {
    await page.goto(`/goals/${ids.draft}`);
    await expect(page.getByText("No target configured")).toBeVisible();
    const progress = region(page, "Progress");
    await expect(progress.getByText("Not computable", { exact: true })).toBeVisible();
    await expect(progress.getByText("No milestones linked")).toBeVisible();
    await expect(page.getByText("No linked projects.")).toBeVisible();
    await expect(page.getByText("No linked skills.")).toBeVisible();
    await expect(page.getByText("No measurement is recorded yet.")).toBeVisible();
    await expect(
      page.getByText(/Risk is assessed for active and on-hold goals only/),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("13, 14: list filters are server-side and persist in the URL", async ({ page }) => {
    await page.goto("/goals");
    await page.getByLabel(/^Risk/).selectOption("at_risk");
    await expect(page).toHaveURL(/risk=at_risk/);
    await page.reload();
    await expect(page.getByLabel(/^Risk/)).toHaveValue("at_risk");
    const table = page.getByRole("table", { name: "goals" });
    await expect(table.getByRole("link", { name: "Fixture Quarterly overdue" })).toBeVisible();
    await expect(table.getByRole("link", { name: "Fixture North Star" })).toHaveCount(0);
    await page.goto("/goals?overdue=true");
    await expect(page.getByRole("button", { name: /Remove filter Overdue: yes/ })).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(2); // header + the overdue goal
  });

  test("12, 14: roadmap timeline, quarter board, tree and dependencies", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await api(page, "PUT", `/api/v1/goals/${ids.overdue}/dependencies`, {
      goalIds: [ids.annual],
    });
    await page.goto("/goals/roadmap");
    const timeline = region(page, /^Timeline/);
    await expect(timeline.getByRole("rowheader", { name: /Fixture Annual latency/ })).toBeVisible();
    await expect(timeline.getByRole("row", { name: /Fixture Annual latency/ })).toContainText(
      "Due ",
    );
    await expect(timeline.getByRole("row", { name: /Fixture Quarterly overdue/ })).toContainText(
      "Overdue",
    );
    await expect(
      region(page, "Goal tree").getByRole("link", { name: "Fixture North Star" }),
    ).toBeVisible();
    await expect(region(page, /^Dependencies/).getByRole("listitem")).toHaveText(
      /Fixture Quarterly overdue\s*depends on\s*Fixture Annual latency/,
    );
    await expect(region(page, /^Open goals without a deadline/)).toContainText(
      "Fixture North Star",
    );
    await expectNoAxeViolations(page);

    // The window lives in the URL and survives a reload.
    await page.getByLabel("From", { exact: true }).fill(d(-1));
    await expect(page).toHaveURL(/from=/);
    await page.reload();
    await expect(page.getByLabel("From", { exact: true })).toHaveValue(d(-1));
    expect(errors).toEqual([]);
  });

  test("goal analytics reconcile with the list and have accessible charts", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/goals/analytics");
    await expect(kpi(page, "Overdue goals")).toHaveAccessibleName(/: 1\./);
    await expect(
      region(page, "Open goals by risk").getByRole("img", {
        name: /Bar chart of open goals by risk/,
      }),
    ).toBeVisible();
    await expect(region(page, "Goals at risk")).toContainText("Fixture Quarterly overdue");
    await expectNoAxeViolations(page);
    await kpi(page, "Overdue goals").click();
    await expect(page).toHaveURL(/\/goals\?overdue=true$/);
    await expect(page.getByRole("table", { name: "goals" }).getByRole("row")).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test("21, 22: the Command Center KPI equals goal analytics and drills to the exact list", async ({
    page,
  }) => {
    await page.goto("/goals/analytics");
    const name = await kpi(page, "Active goals").getAttribute("aria-label");
    const value = /: (\d+)\./.exec(name ?? "")![1]!;
    await page.goto("/command-center");
    await expect(kpi(page, "Active goals")).toHaveAccessibleName(new RegExp(`: ${value}\\.`));
    await kpi(page, "Active goals").click();
    await expect(page).toHaveURL(/\/goals\?status=active$/);
    await expect(page.locator("p[aria-live]")).toHaveText(new RegExp(`^${value} goals? found$`));
  });

  test("24: Phase 3 project intelligence is unchanged", async ({ page }) => {
    await page.goto(`/projects/${ids.project}`);
    await expect(page.getByRole("heading", { name: "Computed health signal" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Manual health", exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Milestones by planned date" })
        .getByText("Fixture milestone late"),
    ).toBeVisible();
  });

  test("19: keyboard — definitions, pickers and filters work without a mouse", async ({ page }) => {
    await page.goto(`/goals/${ids.annual}`);
    const info = page.getByRole("button", { name: "How target attainment is calculated" });
    await info.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(info).toBeFocused();

    const manage = page.getByRole("button", { name: "Manage dependencies" });
    await manage.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox", { name: "Fixture North Star" })).toBeVisible();
    // The goal itself is never offered as its own dependency.
    await expect(dialog.getByRole("checkbox", { name: "Fixture Annual latency" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(manage).toBeFocused();

    await page.goto("/goals");
    const status = page.getByLabel(/^Status/);
    await status.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page).toHaveURL(/status=/);
  });

  test("18: dark theme has no accessibility violations", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    for (const path of [`/goals/${ids.annual}`, "/goals/roadmap", "/goals/analytics"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoAxeViolations(page);
    }
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 375, height: 740 } });

    test("17: goals, dossier, roadmap and analytics fit a phone", async ({ page }) => {
      for (const path of ["/goals", `/goals/${ids.annual}`, "/goals/roadmap", "/goals/analytics"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
        await expectNoAxeViolations(page);
      }
    });
  });

  test.describe("tablet", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("goals, dossier and roadmap fit a tablet", async ({ page }) => {
      for (const path of ["/goals", `/goals/${ids.annual}`, "/goals/roadmap"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    });
  });

  test.describe("wide desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("goal surfaces fit 1440 px without horizontal scrolling", async ({ page }) => {
      for (const path of ["/goals", `/goals/${ids.annual}`, "/goals/roadmap", "/goals/analytics"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    });
  });
});

test("15, 20: a new account sees empty states and none of another user's goals", async ({
  page,
}) => {
  await signIn(page, intruder);
  await page.goto("/goals");
  await expect(page.getByRole("heading", { name: "No goals yet." })).toBeVisible();
  await page.goto("/goals/roadmap");
  await expect(page.getByRole("heading", { name: "No goals yet." })).toBeVisible();
  await page.goto("/goals/analytics");
  await expect(page.getByRole("heading", { name: "No goals yet." })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto(`/goals/${ids.annual}`);
  await expect(page.getByRole("heading", { name: "Goal not found" })).toBeVisible();
  for (const path of [
    `/api/v1/goals/${ids.annual}`,
    `/api/v1/goals/${ids.annual}/intelligence`,
    `/api/v1/goals/${ids.annual}/measurements`,
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  const link = await page.request.put(`/api/v1/goals/${ids.annual}/skills`, {
    data: { skillIds: [] },
  });
  expect(link.status()).toBe(404);
  const list = await page.request.get("/api/v1/goals");
  expect(((await list.json()) as { page: { total: number } }).page.total).toBe(0);
});
