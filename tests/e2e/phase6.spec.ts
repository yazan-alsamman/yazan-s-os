import { expect, test, type Page } from "@playwright/test";

import { collectConsoleErrors, expectNoAxeViolations, newAccount, signUp } from "./helpers";

/**
 * Phase 6 AI Lab & Experimentation on the production build and the isolated test DB. Every record
 * is created by the test through the real API or UI (fixture names only). PEOS records experiments;
 * it never executes models, so all measurements here are values the test records.
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("p6owner");
const intruder = newAccount("p6intruder");
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

test("setup: an evidence record and an intruder account", async ({ page, browser }) => {
  await signUp(page, owner);
  ids.evidence = (
    await api(page, "POST", "/api/v1/evidence", {
      type: "document",
      title: "Fixture eval sheet",
      date: "2026-09-01",
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

  test("the list works and an experiment can be created", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/ai-lab");
    await expect(page.getByRole("heading", { name: "AI Lab", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No experiments yet." })).toBeVisible();
    await page.getByRole("button", { name: "New experiment" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Fixture RAG eval");
    await dialog.getByRole("combobox", { name: "Status", exact: true }).selectOption("active");
    await dialog.getByRole("textbox", { name: "Category", exact: true }).fill("RAG");
    await dialog.getByRole("button", { name: "Create experiment" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name: "Fixture RAG eval" }).first().click();
    await expect(page).toHaveURL(/\/ai-lab\/[0-9a-f-]+$/);
    ids.experiment = page.url().split("/ai-lab/")[1]!;
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("runs, recorded metrics and reproducibility; runs are not overwritten", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/ai-lab/${ids.experiment}`);
    const runs = region(page, /^Runs/);
    await expect(runs.getByText("No runs recorded.")).toBeVisible();

    // Run 1: fully specified → reproducible; with cost and an accuracy metric.
    await runs.getByRole("button", { name: "Add run" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Model", exact: true }).fill("gpt-x");
    await dialog.getByRole("textbox", { name: "Model version", exact: true }).fill("2026-09");
    await dialog.getByRole("textbox", { name: "Prompt version", exact: true }).fill("p1");
    await dialog.getByRole("textbox", { name: "Dataset", exact: true }).fill("fixtures");
    await dialog.getByRole("textbox", { name: "Code ref", exact: true }).fill("abc123");
    await dialog.getByRole("spinbutton", { name: "Cost (USD)", exact: true }).fill("0.5");
    await dialog.getByRole("button", { name: "Add run" }).click();
    await expect(dialog).toBeHidden();
    await expect(runs.getByRole("heading", { name: /Run #1/ })).toBeVisible();
    await expect(runs.getByText("Reproducible (recorded)").first()).toBeVisible();

    // Record an evaluation metric on run 1.
    await runs.getByRole("button", { name: "Add metric" }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Criterion", exact: true }).fill("accuracy");
    await dialog.getByRole("spinbutton", { name: "Value", exact: true }).fill("0.82");
    await dialog.getByRole("combobox", { name: "Direction", exact: true }).selectOption("higher");
    await dialog.getByRole("button", { name: "Add metric" }).click();
    await expect(dialog).toBeHidden();
    await expect(runs.getByRole("rowheader", { name: "accuracy" })).toBeVisible();

    // Run 2: cheaper, higher accuracy, but no code ref → partial reproducibility.
    await runs.getByRole("button", { name: "Add run" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Model", exact: true }).fill("gpt-x");
    await dialog.getByRole("spinbutton", { name: "Cost (USD)", exact: true }).fill("0.3");
    await dialog.getByRole("button", { name: "Add run" }).click();
    await expect(dialog).toBeHidden();
    await expect(runs.getByRole("heading", { name: /Run #2/ })).toBeVisible();
    await expect(runs.getByText("Partially recorded")).toBeVisible();
    await runs.getByRole("button", { name: "Add metric" }).nth(1).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Criterion", exact: true }).fill("accuracy");
    await dialog.getByRole("spinbutton", { name: "Value", exact: true }).fill("0.88");
    await dialog.getByRole("combobox", { name: "Direction", exact: true }).selectOption("higher");
    await dialog.getByRole("button", { name: "Add metric" }).click();
    await expect(dialog).toBeHidden();
    await expectNoAxeViolations(page);
    expect(errors).toEqual([]);
  });

  test("comparison shows deltas and never declares a winner", async ({ page }) => {
    await page.goto(`/ai-lab/${ids.experiment}`);
    const cmp = region(page, "Run comparison (scrolls horizontally on small screens)").or(
      page.getByRole("region", { name: /Run comparison/ }),
    );
    const section = page.locator("#compare");
    await expect(section.getByRole("heading", { name: "Compare runs" })).toBeVisible();
    // Cost went 0.5 → 0.3 (improvement, lower is better); accuracy 0.82 → 0.88 (improvement).
    await expect(section.getByRole("row", { name: /cost/ })).toContainText("-0.2");
    await expect(section.getByRole("row", { name: /accuracy/ })).toContainText("+0.06");
    await expect(section.getByText(/No single winner is declared/)).toBeVisible();
    void cmp;
  });

  test("lifecycle: activate → complete (separate from decision) → reopen → abandon", async ({
    page,
  }) => {
    await page.goto(`/ai-lab/${ids.experiment}`);
    const actions = page.getByRole("group", { name: "Lifecycle actions" });
    await actions.getByRole("button", { name: "Mark completed" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark experiment completed" });
    await dialog.getByRole("button", { name: "Mark completed" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Completed [A-Z]/).first()).toBeVisible();
    // Completed but no decision yet → shown as Undecided, not "successful".
    await expect(page.getByText("Undecided").first()).toBeVisible();
    await actions.getByRole("button", { name: "Reopen" }).click();
    await expect(actions.getByRole("button", { name: "Mark completed" })).toBeVisible();
    await actions.getByRole("button", { name: "Abandon" }).click();
    await expect(page.getByText("Abandoned").first()).toBeVisible();
  });

  test("editing records the owner's decision (adopt) separately from status", async ({ page }) => {
    await page.goto(`/ai-lab/${ids.experiment}`);
    // Restore to active first so we can decide on a live experiment.
    await page
      .getByRole("group", { name: "Lifecycle actions" })
      .getByRole("button", { name: "Activate" })
      .click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: /Decision/ }).selectOption("adopt");
    await dialog.getByRole("textbox", { name: /Result/ }).fill("Adopt gpt-x at prompt p1.");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Adopt").first()).toBeVisible();
  });

  test("evidence links reuse the Evidence domain", async ({ page }) => {
    await page.goto(`/ai-lab/${ids.experiment}`);
    await page.getByRole("button", { name: "Manage evidence" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Fixture eval sheet" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      region(page, /^Evidence/).getByRole("link", { name: "Fixture eval sheet" }),
    ).toBeVisible();
  });

  test("analytics reconcile with the list and KPIs drill down", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/ai-lab/analytics");
    await expect(kpi(page, "AI experiments")).toHaveAccessibleName(/: 1\./);
    await expect(
      region(page, "Experiments by status").getByRole("img", { name: /Bar chart/ }),
    ).toBeVisible();
    // Reproducibility is recorded-metadata, with an explicit caveat.
    await expect(page.getByText(/not a verified reproduction/i)).toBeVisible();
    await expectNoAxeViolations(page);
    await kpi(page, "AI experiments").click();
    await expect(page).toHaveURL(/\/ai-lab$/);
    await expect(page.getByRole("table", { name: "experiments" }).getByRole("row")).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test("the Command Center shows the Active experiments KPI and drills to the list", async ({
    page,
  }) => {
    await page.goto("/ai-lab/analytics");
    const name = await kpi(page, "Active experiments").getAttribute("aria-label");
    const value = /: (\d+)\./.exec(name ?? "")![1]!;
    await page.goto("/command-center");
    await expect(kpi(page, "Active experiments")).toHaveAccessibleName(new RegExp(`: ${value}\\.`));
    await kpi(page, "Active experiments").click();
    await expect(page).toHaveURL(/\/ai-lab\?open=true$/);
  });

  test("missing-data states are explicit, never zero", async ({ page }) => {
    const e = await api(page, "POST", "/api/v1/experiments", { title: "Fixture bare" });
    await page.goto(`/ai-lab/${e.id}`);
    await expect(page.getByText("No runs recorded.")).toBeVisible();
    await expect(region(page, "Reproducibility").getByText("Unknown")).toBeVisible();
    await expect(page.getByText("No evidence linked.")).toBeVisible();
    await expect(page.getByText(/No runs are recorded yet/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("filters persist in the URL", async ({ page }) => {
    await page.goto("/ai-lab");
    await page.getByLabel(/^Status/).selectOption("active");
    await expect(page).toHaveURL(/status=active/);
    await page.reload();
    await expect(page.getByLabel(/^Status/)).toHaveValue("active");
  });

  test("Phase 5 goals and Phase 4 skills remain unchanged", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Goals", level: 1 })).toBeVisible();
    await page.goto("/skills/intelligence");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("dark theme has no accessibility violations", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    for (const path of [`/ai-lab/${ids.experiment}`, "/ai-lab", "/ai-lab/analytics"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoAxeViolations(page);
    }
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
  });

  test("keyboard: add-run dialog opens and returns focus", async ({ page }) => {
    await page.goto(`/ai-lab/${ids.experiment}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const add = region(page, /^Runs/).getByRole("button", { name: "Add run" });
    await expect(add).toBeVisible();
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(add).toBeFocused();
  });

  async function noOverflow(page: Page, axe: boolean) {
    for (const path of ["/ai-lab", `/ai-lab/${ids.experiment}`, "/ai-lab/analytics"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    if (axe) await expectNoAxeViolations(page);
  }

  test.describe("phone", () => {
    test.use({ viewport: { width: 375, height: 740 } });
    test("AI Lab fits a phone (375px) with no horizontal scroll", async ({ page }) => {
      await noOverflow(page, true);
    });
  });
  test.describe("tablet", () => {
    test.use({ viewport: { width: 768, height: 1024 } });
    test("AI Lab fits a tablet (768px)", async ({ page }) => {
      await noOverflow(page, false);
    });
  });
  test.describe("wide desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test("AI Lab fits a wide desktop (1440px)", async ({ page }) => {
      await noOverflow(page, false);
    });
  });
});

test("a new account sees an empty AI Lab and none of another user's experiments", async ({
  page,
}) => {
  await signIn(page, intruder);
  await page.goto("/ai-lab");
  await expect(page.getByRole("heading", { name: "No experiments yet." })).toBeVisible();
  await page.goto("/ai-lab/analytics");
  await expect(page.getByRole("heading", { name: "No experiments yet." })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto(`/ai-lab/${ids.experiment}`);
  await expect(page.getByRole("heading", { name: "Experiment not found" })).toBeVisible();
  for (const path of [
    `/api/v1/experiments/${ids.experiment}`,
    `/api/v1/experiments/${ids.experiment}/intelligence`,
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  const list = await page.request.get("/api/v1/experiments");
  expect(((await list.json()) as { page: { total: number } }).page.total).toBe(0);
});
