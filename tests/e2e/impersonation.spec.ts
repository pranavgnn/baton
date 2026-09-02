import { expect, test } from "@playwright/test";

import { expectToast, storageStatePath } from "./helpers";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: storageStatePath("superAdmin") });

const EMPLOYEE = "employee@manipal.edu";

test.describe("acting as another user", () => {
  test("swaps the session, then hands it back", async ({ page }) => {
    await page.goto("/admin/users");
    await page.getByRole("textbox", { name: "Search users" }).fill(EMPLOYEE);
    await page
      .getByTestId(`user-${EMPLOYEE}`)
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page.getByRole("menuitem", { name: "View as this user" }).click();
    await expectToast(page, "You are now viewing as Test Employee.");

    // Landed on their dashboard, as them.
    await expect(page).toHaveURL(/\/dashboard$/);
    const banner = page.getByTestId("impersonation-banner");
    await expect(banner).toContainText("Test Employee");
    await expect(banner).toContainText("Super Admin");

    // The session really is theirs: the admin area is gone, and the applicant's
    // own page is reachable.
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByText("Admin"),
    ).toHaveCount(0);
    await page.goto("/application");
    await expect(page.getByTestId("impersonation-banner")).toBeVisible();

    // Nothing that would act on the borrowed account's credentials is offered.
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByTestId("change-password")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByTestId("stop-impersonating").click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByText("Admin"),
    ).toBeVisible();
  });

  test("records both halves against the administrator", async ({ page }) => {
    await page.goto("/admin/audit");

    const table = page.getByTestId("audit-table");
    await expect(table).toContainText("Super Admin started acting as Test");
    await expect(table).toContainText("stopped acting as Test Employee");
  });
});
