import fs from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import { ACCOUNTS, storageStatePath, type AccountName } from "./helpers";

/**
 * Signs in once per role and saves the session cookie for the specs to reuse.
 *
 * Better Auth deliberately rate-limits `/sign-in` to a handful of attempts per
 * window, which is correct for a real deployment. Authenticating once here
 * keeps the suite well inside that budget - and makes it much faster - rather
 * than weakening the protection for the sake of tests.
 */
const ROLES: AccountName[] = [
  "superAdmin",
  "employee",
  "dean",
  "associateDean",
  "associateDean2",
  "hr",
  "rc",
  "fdw",
  "director",
  "associateDirector",
  "instituteHr",
];

setup.describe.configure({ mode: "serial" });

setup("authenticate every role", async ({ browser }) => {
  setup.setTimeout(180_000);

  fs.mkdirSync(path.dirname(storageStatePath("superAdmin")), {
    recursive: true,
  });

  for (const role of ROLES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { email, password } = ACCOUNTS[role];

    // Retry through the sign-in rate-limit window instead of disabling it.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await page.goto("/sign-in");
      await page.getByLabel("Institute email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();

      const landed = await page
        .waitForURL(/\/dashboard/, { timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (landed) break;

      await page.waitForTimeout(11_000);
    }

    await expect(page).toHaveURL(/\/dashboard/);
    await context.storageState({ path: storageStatePath(role) });
    await context.close();
  }
});
