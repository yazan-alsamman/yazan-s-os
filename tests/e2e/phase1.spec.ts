import { expect, test } from "@playwright/test";

import {
  collectConsoleErrors,
  createFromList,
  expectNoAxeViolations,
  newAccount,
  pickRelations,
  readDownload,
  signUp,
} from "./helpers";

/**
 * Phase 1 critical workflows (prompt §42) on the production build and the isolated test DB.
 * All records are created in the test itself; nothing is seeded.
 */
test.describe.configure({ mode: "serial" });

const owner = newAccount("owner");

test("a new account starts empty: every list shows an honest empty state", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signUp(page, owner);
  for (const [path, text] of [
    ["/projects", "No projects yet."],
    ["/skills", "No skills yet."],
    ["/skills/technologies", "No technologies yet."],
    ["/certifications", "No certifications yet."],
    ["/evidence", "No evidence yet."],
    ["/career/experience", "No experience yet."],
    ["/career/education", "No education yet."],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: text })).toBeVisible();
  }
  await expectNoAxeViolations(page);
  expect(errors).toEqual([]);
});

test.describe("signed-in flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/command-center$/);
  });

  test("profile: create and update, persisted server-side", async ({ page }) => {
    await page.goto("/career/profile");
    await expect(page.getByText("No profile yet.")).toBeVisible();
    await page.getByLabel("Headline", { exact: true }).fill("Platform engineer (test)");
    await page.getByLabel("Location", { exact: true }).fill("Test City");
    await page.getByLabel("Website", { exact: true }).fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Enter a full http(s):// URL")).toBeVisible();

    await page.getByLabel("Website", { exact: true }).fill("https://example.invalid");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved at" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Headline", { exact: true })).toHaveValue(
      "Platform engineer (test)",
    );
    await expectNoAxeViolations(page);
  });

  test("project: create → add skill, technology, evidence → view project", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await createFromList(page, "/skills", "New skill", { Name: "E2E Distributed Systems" });
    await createFromList(page, "/skills/technologies", "New technology", {
      Name: "E2E Postgres",
      Version: "17",
    });
    await createFromList(
      page,
      "/evidence",
      "New evidence item",
      { Title: "E2E Design Doc" },
      { Type: "document" },
    );
    await createFromList(
      page,
      "/projects",
      "New project",
      { Name: "E2E Data Platform" },
      { "Lifecycle status": "development" },
    );

    await page.getByRole("link", { name: "E2E Data Platform" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Data Platform" })).toBeVisible();
    await expect(page.getByText("No skills linked yet.")).toBeVisible();

    await pickRelations(page, "Manage skills", [{ label: "E2E Distributed Systems" }]);
    await pickRelations(page, "Manage technologies", [
      { label: "E2E Postgres", attribute: "infrastructure" },
    ]);
    await pickRelations(page, "Manage evidence", [{ label: "E2E Design Doc" }]);

    await expect(page.getByRole("heading", { name: "Skills (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technologies (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidence (1)" })).toBeVisible();
    await expect(page.getByText("Infrastructure")).toBeVisible();
    await expect(page.getByText("Entered manually in PEOS.")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.reload();
    await expect(page.getByRole("link", { name: "E2E Distributed Systems" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("skill: attach evidence with strength → view linked projects", async ({ page }) => {
    await page.goto("/skills");
    await page.getByRole("link", { name: "E2E Distributed Systems" }).first().click();
    await expect(page.getByRole("heading", { name: "Projects (1)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Data Platform" })).toBeVisible();

    await pickRelations(page, "Manage evidence", [
      { label: "E2E Design Doc", attribute: "strong" },
    ]);
    await expect(page.getByText("Strength: Strong")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("certification: create → attach skill → attach evidence", async ({ page }) => {
    await createFromList(page, "/certifications", "New certification", {
      Name: "E2E Cloud Cert",
      Issuer: "E2E Issuer",
      "Verification URL": "https://verify.example.invalid/abc",
    });
    await page.getByRole("link", { name: "E2E Cloud Cert" }).first().click();
    await pickRelations(page, "Manage related skills", [{ label: "E2E Distributed Systems" }]);
    await pickRelations(page, "Manage evidence", [{ label: "E2E Design Doc" }]);
    await expect(page.getByRole("heading", { name: "Related skills (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidence (1)" })).toBeVisible();
    const verification = page.getByRole("link", { name: /verify\.example\.invalid/ });
    await expect(verification).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  test("search, filters and pagination controls work on lists", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("searchbox", { name: "Search" }).fill("zzz-no-match");
    await expect(page.getByRole("heading", { name: "No matching projects" })).toBeVisible();
    await page.getByRole("button", { name: "Clear search and filters" }).click();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("development");
    await expect(page.getByRole("link", { name: "E2E Data Platform" }).first()).toBeVisible();
    await expect(page).toHaveURL(/status=development/);

    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").getByRole("combobox").fill("E2E Data");
    await expect(page.getByRole("option", { name: /E2E Data Platform/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "E2E Data Platform" })).toBeVisible();
  });

  test("import: upload JSON → review → accept → persisted with provenance", async ({ page }) => {
    const document = {
      format: "peos.exchange",
      version: 1,
      skills: [{ name: "E2E Imported Skill", category: "Testing" }],
      projects: [{ name: "E2E Imported Project", skills: ["E2E Imported Skill"] }],
      evidence: [{ type: "document", title: "E2E Design Doc" }],
    };
    await page.goto("/settings/import");
    await page.getByLabel("File (max 2 MB, UTF-8)").setInputFiles({
      name: "e2e-import.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await page.getByRole("button", { name: "Upload and parse" }).click();
    await expect(page.getByText("Parsed 3 record(s), 0 invalid.")).toBeVisible();
    await page.getByRole("link", { name: "Open review queue" }).click();

    await expect(page.getByText("Matches existing record")).toBeVisible();
    await expect(page.getByText("E2E Imported Project", { exact: true }).first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Accept all new valid records" }).click();
    await expect(page.getByText("Accepted 2. 1 left for individual review")).toBeVisible();
    // Only the duplicate (existing evidence) remains pending once the queue refreshes.
    const reject = page.getByRole("button", { name: "Reject", exact: true });
    await expect(reject).toHaveCount(1);
    await reject.click();
    await expect(page.getByRole("status").filter({ hasText: "Rejected" })).toBeVisible();

    await page.goto("/projects");
    await page.getByRole("link", { name: "E2E Imported Project" }).first().click();
    await expect(page.getByRole("heading", { name: "Provenance" })).toBeVisible();
    await expect(page.getByText("e2e-import.json")).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Imported Skill" })).toBeVisible();
  });

  test("export: downloads only the owner's data with relationships", async ({ page, browser }) => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage, newAccount("other"));
    const created = await otherPage.request.post("/api/v1/projects", {
      data: { name: "Other User Secret Project" },
    });
    expect(created.status()).toBe(201);
    await other.close();

    await page.goto("/settings/export");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download JSON" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^peos-export-\d{4}-\d{2}-\d{2}\.json$/);
    const text = await readDownload(download);
    const exported = JSON.parse(text) as { projects: { name: string; skills: string[] }[] };
    expect(exported.projects.map((p) => p.name).sort()).toEqual([
      "E2E Data Platform",
      "E2E Imported Project",
    ]);
    expect(exported.projects.find((p) => p.name === "E2E Data Platform")?.skills).toEqual([
      "E2E Distributed Systems",
    ]);
    expect(text).not.toContain("Other User Secret Project");
  });

  test("delete asks for confirmation and removes the record", async ({ page }) => {
    await createFromList(page, "/career/education", "New education entry", {
      Institution: "E2E University",
    });
    await page.getByRole("button", { name: "Actions for E2E University" }).first().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("permanently deleted");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No education yet." })).toBeVisible();
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("lists render as cards without horizontal overflow", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/command-center$/);
    await page.goto("/projects");
    await expect(page.getByRole("link", { name: "E2E Data Platform" }).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  });
});
