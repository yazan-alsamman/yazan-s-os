import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 0 smoke: application starts → auth boundary → protected shell.
 * The only data created is a throwaway test account on the isolated test database,
 * using the reserved `.invalid` TLD.
 */
const account = {
  name: "E2E Smoke",
  email: `e2e-${Date.now()}@peos-test.invalid`,
  password: "e2e-smoke-passphrase",
};

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} — ${n.failureSummary ?? v.help}`),
  );
  expect(violations).toEqual([]);
}

async function signUp(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(account.name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel(/^Password/).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/command-center$/);
}

test.describe.configure({ mode: "serial" });

test("health endpoint reports infrastructure status without details", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { status: string; checks: Record<string, string> };
  expect(body.status).toBe("healthy");
  expect(body.checks).toMatchObject({ database: "healthy", redis: "healthy" });
  expect(response.headers()["x-request-id"]).toBeTruthy();
});

test("protected API rejects anonymous requests with the standard error shape", async ({
  request,
}) => {
  const response = await request.get("/api/v1/me");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    code: "UNAUTHENTICATED",
    requestId: expect.any(String),
  });
});

test("anonymous visitors are sent to sign-in, which is accessible", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const response = await page.goto("/projects");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprojects$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  expect(response?.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await expectNoAxeViolations(page);
  expect(errors).toEqual([]);
});

test("wrong credentials show a non-enumerating error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@peos-test.invalid");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Email or password is incorrect." }),
  ).toBeVisible();
});

test("a signed-in user reaches the protected shell, which shows no fabricated data", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await signUp(page);

  await expect(page.getByRole("heading", { level: 1, name: "Command Center" })).toBeVisible();
  // Phase 2: the Command Center is live; a new account sees the first-run state, not numbers.
  await expect(
    page.getByRole("heading", { name: "Your Command Center will populate as you add records" }),
  ).toBeVisible();
  await expect(page.getByText(/^System status/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Planned sections render the honest unavailable state.
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: /AI Lab/ })
    .click();
  await expect(page).toHaveURL(/\/ai-lab$/);
  await expect(page.getByRole("heading", { name: "Not available yet" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("command palette, settings, theme and sign-out work end to end", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/command-center$/);

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  // Record search through the palette is covered in phase1.spec.ts.
  await palette.getByRole("combobox").fill("Go to Settings");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);

  // Account details come from GET /api/v1/me.
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();

  await page.getByText("Dark", { exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoAxeViolations(page);
  await page.getByText("Light", { exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);

  expect(errors).toEqual([]);
});

test("unknown routes return a real 404", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/command-center$/);

  const response = await page.goto("/definitely-not-a-section");
  expect(response?.status()).toBe(404);
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("has bottom navigation and no horizontal overflow", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/command-center$/);

    await expect(page.getByRole("navigation", { name: "Primary (mobile)" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
