import { expect, test } from "@playwright/test";

import { ACCOUNTS, expectToast, storageStatePath } from "./helpers";

/**
 * A disabled account keeps its session, so every page it asks for redirects it
 * back to the notice. Without a way to end that session the person is stuck
 * there for as long as the cookie lasts.
 */
test.describe.configure({ mode: "serial" });

const TARGET = ACCOUNTS.dean;

async function setDeanDisabled(
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
    await setDeanDisabled(admin, true);

    const page = await browser.newPage();
    try {
      await page.goto("/sign-in");
      await page.getByRole("textbox", { name: "Email" }).fill(TARGET.email);
      await page
        .getByRole("textbox", { name: "Password" })
        .fill(TARGET.password);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/\/account-disabled/);
      await expect(
        page.getByText("Your account has been disabled"),
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
      await setDeanDisabled(admin, false);
      await admin.close();
    }
  });
});
