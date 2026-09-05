import { expect, test } from "@playwright/test";

import { ACCOUNTS, expectToast, storageStatePath } from "./helpers";

/**
 * A disabled account keeps its session, so every page it asks for redirects it
 * back to the notice. Without a way to end that session the person is stuck
 * there for as long as the cookie lasts.
 */
test.describe.configure({ mode: "serial" });

const TARGET = ACCOUNTS.records;

async function setTargetDisabled(
  page: import("@playwright/test").Page,
  disabled: boolean,
) {
  await page.goto("/admin/users");
  const row = page.getByTestId(`user-${TARGET.email}`);
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page
    .getByRole("menuitem", {
      name: disabled ? "Disable access" : "Re-enable access",
    })
    .click();
  await expectToast(
    page,
    disabled ? "Account disabled." : "Account re-enabled.",
  );
}

test.describe("a disabled account", () => {
  test("is sent to the notice and can sign out of it", async ({ browser }) => {
    const admin = await browser.newPage({
      storageState: storageStatePath("superAdmin"),
    });
    await setTargetDisabled(admin, true);

    const page = await browser.newPage();
    try {
      // Better Auth rate-limits sign-in, and a retry of this test arrives well
      // inside that window, so wait it out rather than weakening it.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await page.goto("/sign-in");
        await page.getByRole("textbox", { name: "Email" }).fill(TARGET.email);
        await page
          .getByRole("textbox", { name: "Password" })
          .fill(TARGET.password);
        await page.getByRole("button", { name: "Sign in" }).click();

        const landed = await page
          .waitForURL(/\/account-disabled/, { timeout: 8_000 })
          .then(() => true)
          .catch(() => false);
        if (landed) break;

        await page.waitForTimeout(11_000);
      }

      await expect(page).toHaveURL(/\/account-disabled/);
      // By role, not by text: the notice and the paragraph under it share a
      // wrapper, and a loose text match claims both.
      await expect(
        page.getByRole("heading", { name: "Your account has been disabled" }),
      ).toBeVisible();

      // The dead end: any other route lands back here while the session lives.
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/account-disabled/);

      await page.getByTestId("sign-out").click();
      await expect(page).toHaveURL(/\/sign-in/);

      // And the session is really gone, not just navigated away from.
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/sign-in/);
    } finally {
      await page.close();
      await setTargetDisabled(admin, false);
      await admin.close();
    }
  });
});
