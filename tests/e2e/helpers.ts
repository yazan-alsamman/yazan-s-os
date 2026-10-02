import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Throwaway test accounts on the isolated test database (reserved `.invalid` TLD). */
export function newAccount(label: string) {
  return {
    name: `E2E ${label}`,
    email: `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@peos-test.invalid`,
    password: "e2e-phase1-passphrase",
  };
}

export async function signUp(page: Page, account: ReturnType<typeof newAccount>) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(account.name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel(/^Password/).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/command-center$/);
}

export function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} — ${n.failureSummary ?? v.help}`),
  );
  expect(violations).toEqual([]);
}

/** Open the list page's "New …" dialog, fill text fields by label, submit. */
export async function createFromList(
  page: Page,
  path: string,
  buttonName: string,
  values: Record<string, string>,
  selects: Record<string, string> = {},
) {
  await page.goto(path);
  await page.getByRole("button", { name: buttonName }).first().click();
  const dialog = page.getByRole("dialog");
  for (const [label, value] of Object.entries(values)) {
    await dialog.getByRole("textbox", { name: label, exact: true }).fill(value);
  }
  for (const [label, value] of Object.entries(selects)) {
    await dialog.getByRole("combobox", { name: label, exact: true }).selectOption(value);
  }
  await dialog.getByRole("button", { name: /^Create / }).click();
  await expect(dialog).toBeHidden();
}

/** In a relation picker dialog: tick the named options (optionally choose an attribute) and save. */
export async function pickRelations(
  page: Page,
  manageButton: string,
  picks: { label: string; attribute?: string }[],
) {
  await page.getByRole("button", { name: manageButton }).click();
  const dialog = page.getByRole("dialog");
  for (const pick of picks) {
    await dialog.getByRole("checkbox", { name: pick.label }).check();
    if (pick.attribute) {
      await dialog
        .getByRole("combobox", { name: new RegExp(`for ${pick.label}$`) })
        .selectOption(pick.attribute);
    }
  }
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}
