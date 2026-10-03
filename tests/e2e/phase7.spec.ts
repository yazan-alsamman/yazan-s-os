import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 7 Architecture Intelligence on the production build and the isolated test DB. Every record
 * is created by the test through the real API or UI (fixture names only).
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p7owner");
const intruder = newAccount("p7intruder");
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

test("setup: a project, evidence, a technology and an intruder account", async ({
  page,
  browser,
}) => {
  await signUp(page, owner);
  ids.project = (await api(page, "POST", "/api/v1/projects", { name: "Fixture Payments" })).id;
  ids.evidence = (
    await api(page, "POST", "/api/v1/evidence", {
      type: "document",
      title: "Fixture load test report",
    })
  ).id;
  ids.tech = (await api(page, "POST", "/api/v1/technologies", { name: "Fixture PostgreSQL" })).id;
  const other = await browser.newContext();
  await signUp(await other.newPage(), intruder);
  await other.close();
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the decisions list works and a decision can be documented", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/architecture");
    await expect(
      page.getByRole("heading", { name: "Architecture decisions", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No architecture decisions yet." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New decision" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Fixture: Postgres for ledger");
    await dialog
      .getByRole("textbox", { name: "Context", exact: true })
      .fill("Need ACID transfers.");
    await dialog.getByRole("button", { name: "Create decision" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name: "Fixture: Postgres for ledger" }).first().click();
    await expect(page).toHaveURL(/\/architecture\/[0-9a-f-]+$/);
    ids.decision = page.url().split("/architecture/")[1]!;
    await expect(page.getByText("Proposed").first()).toBeVisible();
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("accept with a decision date, record alternatives, link project and evidence", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/architecture/${ids.decision}`);
    const actions = page.getByRole("group", { name: "Lifecycle actions" });
    await expect(actions.getByRole("button")).toHaveText(["Accept", "Reject"]);
    await actions.getByRole("button", { name: "Accept" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Accept" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Decided [A-Z]/)).toBeVisible();

    await page.getByRole("button", { name: "Add alternative" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Option", exact: true }).fill("MongoDB");
    await dialog
      .getByRole("textbox", { name: "Why not chosen", exact: true })
      .fill("No multi-document ACID");
    await dialog.getByRole("button", { name: "Add alternative" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      region(page, /^Alternatives \(1\)/).getByRole("heading", { name: "MongoDB" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Manage related projects" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Fixture Payments" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Manage evidence" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Fixture load test report" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      region(page, /^Evidence \(1\)/).getByRole("link", { name: "Fixture load test report" }),
    ).toBeVisible();
    // Decision and consequences are still missing — listed, not scored.
    await expect(page.getByRole("list", { name: "Missing parts" })).toContainText("Decision");
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("components, dependencies and governing a critical component", async ({ page }) => {
    ids.db = (
      await api(page, "POST", "/api/v1/architecture/components", {
        name: "Fixture ledger DB",
        type: "database",
        critical: true,
      })
    ).id;
    await page.goto("/architecture/components");
    await page.getByRole("button", { name: "New component" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Fixture payments API");
    await dialog.getByRole("button", { name: "Create component" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name: "Fixture payments API" }).first().click();
    ids.api = page.url().split("/components/")[1]!;
    await page.getByRole("button", { name: "Manage dependencies" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox", { name: "Fixture payments API" })).toHaveCount(0);
    await dialog.getByRole("checkbox", { name: "Fixture ledger DB" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Manage technologies" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Fixture PostgreSQL" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      region(page, /^Depends on \(1\)/).getByRole("link", { name: "Fixture ledger DB" }),
    ).toBeVisible();

    await page.goto(`/architecture/components/${ids.db}`);
    await expect(
      region(page, /^Used by \(1\)/).getByRole("link", { name: "Fixture payments API" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // The decision governs the critical DB and its revisit date has passed → stale critical.
    await api(page, "PUT", `/api/v1/architecture/decisions/${ids.decision}/components`, {
      componentIds: [ids.db],
    });
    await api(page, "PATCH", `/api/v1/architecture/decisions/${ids.decision}`, {
      revisitDate: d(-3),
    });
    await page.goto(`/architecture/${ids.decision}`);
    await expect(page.getByText("Stale critical").first()).toBeVisible();
    await expect(page.getByText(/governs 1 critical component/)).toBeVisible();
  });

  test("supersession keeps history; the superseded decision stays listed", async ({ page }) => {
    ids.next = (
      await api(page, "POST", "/api/v1/architecture/decisions", {
        title: "Fixture: Postgres 17 cluster",
        status: "accepted",
      })
    ).id;
    await page.goto(`/architecture/${ids.decision}`);
    await page
      .getByRole("group", { name: "Lifecycle actions" })
      .getByRole("button", { name: "Supersede…" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Superseded by")
      .selectOption({ label: "Fixture: Postgres 17 cluster (Accepted)" });
    await dialog.getByRole("button", { name: "Supersede" }).click();
    await expect(dialog).toBeHidden();
    const supersession = region(page, "Supersession");
    await expect(
      supersession.getByRole("link", { name: "Fixture: Postgres 17 cluster" }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Decision history, oldest first" })).toContainText(
      "Accepted → Superseded",
    );
    await page.goto("/architecture?status=superseded");
    await expect(
      page
        .getByRole("table", { name: "decisions" })
        .getByRole("link", { name: "Fixture: Postgres for ledger" }),
    ).toBeVisible();
    // The successor cannot be deleted while it supersedes history.
    await page.goto(`/architecture/${ids.next}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm.getByRole("alert")).toContainText("supersedes 1 other decision");
    await confirm.getByRole("button", { name: "Cancel" }).click();
  });

  test("the map is bounded, truthful and has a table alternative; filters persist", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/architecture/map");
    await expect(
      page.getByRole("img", {
        name: /Network graph of 2 architecture components and 1 dependencies/,
      }),
    ).toBeVisible();
    const table = page.getByRole("table", { name: /what each depends on/ });
    await expect(table.getByRole("row", { name: /Fixture payments API/ })).toContainText(
      "Fixture ledger DB",
    );
    await expectNoAxeViolations(page);
    await page.getByLabel("Component type").selectOption("database");
    await expect(page).toHaveURL(/type=database/);
    await page.reload();
    await expect(page.getByLabel("Component type")).toHaveValue("database");
    await expect(
      page.getByRole("table", { name: /what each depends on/ }).getByRole("rowheader"),
    ).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("analytics reconcile with the lists and drill down", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/architecture/analytics");
    await expect(kpi(page, "Architecture decisions")).toHaveAccessibleName(/: 2\./);
    await expect(kpi(page, "Stale critical decisions")).toHaveAccessibleName(/: 0\./); // superseded now
    await expect(
      region(page, "Decisions by status").getByRole("img", { name: /Bar chart/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await kpi(page, "Project architecture coverage").click();
    await expect(page).toHaveURL(/\/projects\?hasArchitecture=true$/);
    await expect(
      page.getByRole("table", { name: "projects" }).getByRole("link", { name: "Fixture Payments" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the Command Center shows the KPI and stale critical decisions", async ({ page }) => {
    // Reinstate the decision so it is in force, due and critical again.
    await api(page, "PATCH", `/api/v1/architecture/decisions/${ids.decision}`, {
      status: "accepted",
    });
    await page.goto("/architecture/analytics");
    const name = await kpi(page, "Architecture decisions").getAttribute("aria-label");
    const value = /: (\d+)\./.exec(name ?? "")![1]!;
    await page.goto("/command-center");
    await expect(kpi(page, "Architecture decisions")).toHaveAccessibleName(
      new RegExp(`: ${value}\\.`),
    );
    await expect(page.getByText("Stale critical decision")).toBeVisible();
    await page.getByRole("link", { name: /^Fixture: Postgres for ledger Revisit was due/ }).click();
    await expect(page).toHaveURL(new RegExp(`/architecture/${ids.decision}$`));
  });

  test("projects expose architecture as structured knowledge (Phase 3 dossier intact)", async ({
    page,
  }) => {
    await api(page, "PUT", `/api/v1/architecture/components/${ids.db}/projects`, {
      projectIds: [ids.project],
    });
    await page.goto(`/projects/${ids.project}`);
    await expect(page.getByRole("heading", { name: "Computed health signal" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Architecture decisions (1)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture: Postgres for ledger" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture ledger DB" })).toBeVisible();
  });

  test("missing data is explicit, never zero", async ({ page }) => {
    const bare = await api(page, "POST", "/api/v1/architecture/decisions", {
      title: "Fixture bare",
    });
    await page.goto(`/architecture/${bare.id}`);
    await expect(page.getByText("No evidence linked.")).toBeVisible();
    await expect(page.getByText("Not linked to a project.")).toBeVisible();
    await expect(page.getByText("No alternatives recorded.")).toBeVisible();
    await expect(page.getByText("No revisit date is recorded.")).toHaveCount(0); // proposals: not applicable
    await expect(page.getByText("Revisit dates apply to accepted decisions only.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Missing parts" })).toContainText("Context");
    await expectNoAxeViolations(page);
  });

  test("keyboard: lifecycle dialog and pickers return focus", async ({ page }) => {
    await page.goto(`/architecture/${ids.next}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const manage = page.getByRole("button", { name: "Manage evidence" });
    await manage.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(manage).toBeFocused();
    await page.goto("/architecture");
    const status = page.getByLabel(/^Status/);
    await status.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page).toHaveURL(/status=/);
  });

  test("dark theme has no accessibility violations", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    for (const path of [
      `/architecture/${ids.decision}`,
      "/architecture/map",
      "/architecture/analytics",
      `/architecture/components/${ids.api}`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoAxeViolations(page);
    }
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
  });

  async function noOverflow(page: Page, axe: boolean) {
    for (const path of [
      "/architecture",
      `/architecture/${ids.decision}`,
      "/architecture/components",
      "/architecture/map",
      "/architecture/analytics",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
      if (axe) await expectNoAxeViolations(page);
    }
  }

  test.describe("phone", () => {
    test.use({ viewport: { width: 375, height: 740 } });
    test("architecture surfaces fit a phone (375px)", async ({ page }) => {
      await noOverflow(page, true);
    });
  });
  test.describe("tablet", () => {
    test.use({ viewport: { width: 768, height: 1024 } });
    test("architecture surfaces fit a tablet (768px)", async ({ page }) => {
      await noOverflow(page, false);
    });
  });
  test.describe("wide desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test("architecture surfaces fit a wide desktop (1440px)", async ({ page }) => {
      await noOverflow(page, false);
    });
  });
});

test("a new account sees empty architecture views and none of another user's records", async ({
  page,
}) => {
  await signIn(page, intruder);
  await page.goto("/architecture");
  await expect(page.getByRole("heading", { name: "No architecture decisions yet." })).toBeVisible();
  await page.goto("/architecture/map");
  await expect(page.getByRole("heading", { name: "No components to show." })).toBeVisible();
  await page.goto("/architecture/analytics");
  await expect(page.getByRole("heading", { name: "No architecture records yet." })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.goto(`/architecture/${ids.decision}`);
  await expect(page.getByRole("heading", { name: "Decision not found" })).toBeVisible();
  await page.goto(`/architecture/components/${ids.db}`);
  await expect(page.getByRole("heading", { name: "Component not found" })).toBeVisible();
  for (const path of [
    `/api/v1/architecture/decisions/${ids.decision}`,
    `/api/v1/architecture/decisions/${ids.decision}/intelligence`,
    `/api/v1/architecture/components/${ids.db}/intelligence`,
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  const list = await page.request.get("/api/v1/architecture/decisions");
  expect(((await list.json()) as { page: { total: number } }).page.total).toBe(0);
});
