import { expect, test } from "@playwright/test";

import { closeOverlays, expectToast, storageStatePath } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ storageState: storageStatePath("superAdmin") });

test.describe("audit log", () => {
  test("records an administrative action as it happens", async ({ page }) => {
    // Something the log cannot already contain, so the assertion is about this
    // action rather than about whatever the seed left behind.
    await page.goto("/admin/roles");
    await page.getByTestId("new-role").click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Audited Role");
    await page.getByRole("button", { name: "Create role" }).click();
    await expectToast(page, "Role created.");

    await page.goto("/admin/audit");
    await expect(page.getByTestId("audit-table")).toBeVisible();
    await expect(page.getByTestId("audit-table")).toContainText(
      'Created the role "Audited Role".',
    );
    // Who did it, not just what happened.
    await expect(page.getByTestId("audit-table")).toContainText(
      "superadmin@manipal.edu",
    );
  });

  test("records signing in", async ({ page }) => {
    await page.goto("/admin/audit");
    await page.getByTestId("audit-search").fill("signed in");
    await page.getByTestId("audit-search").press("Enter");

    await expect(page.getByTestId("audit-table")).toContainText("Signed in");
  });

  test("filters by several actions at once, and says so in the URL", async ({
    page,
  }) => {
    await page.goto("/admin/audit");

    // Both are chosen while the panel is open; closing it applies them.
    await page.getByTestId("audit-action-filter").click();
    await page.getByTestId("audit-action-role.created").click();
    await page.getByTestId("audit-action-auth.signed_in").click();
    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(/actions=role\.created%2Cauth\.signed_in/);

    const table = page.getByTestId("audit-table");
    await expect(table).toContainText("Role created");
    await expect(table).toContainText("Signed in");
    await expect(table).not.toContainText("Workflow published");

    // Each is listed as its own chip, and can be dropped on its own.
    const chips = page.getByTestId("audit-active-filters");
    await expect(chips).toContainText("Role created");
    await expect(chips).toContainText("Signed in");

    // The URL is the whole state, so the view survives a reload and can be
    // sent to a colleague.
    await page.reload();
    await expect(table).toContainText("Role created");

    await chips
      .getByRole("button", { name: "Remove filter: Signed in" })
      .click();
    await expect(page).toHaveURL(/actions=role\.created(?!%2C)/);
    await expect(table).not.toContainText("Signed in");
  });

  test("finds a person by typing rather than listing everyone", async ({
    page,
  }) => {
    await page.goto("/admin/audit");

    await page.getByTestId("audit-actor-filter").click();
    await page.getByTestId("audit-actor-search").fill("superadmin");

    await page.getByTestId("audit-actor-superadmin@manipal.edu").click();

    await expect(page).toHaveURL(/actor=/);
    await expect(page.getByTestId("audit-active-filters")).toContainText(
      "by Super Admin",
    );
    await expect(page.getByTestId("audit-table")).toContainText(
      "superadmin@manipal.edu",
    );
  });

  test("reports honestly when nothing matches", async ({ page }) => {
    await page.goto("/admin/audit");
    await page
      .getByTestId("audit-search")
      .fill("this string appears in no entry at all");
    await page.getByTestId("audit-search").press("Enter");

    await expect(page.getByTestId("audit-empty")).toBeVisible();
    await expect(page.getByTestId("audit-count")).toContainText("0 entries");
  });

  test("excludes a day the action did not happen on", async ({ page }) => {
    // The seed and this run are both today, so a window that ends yesterday
    // must be empty.
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);

    await page.goto(`/admin/audit?to=${yesterday}`);
    await expect(page.getByTestId("audit-empty")).toBeVisible();
  });

  test("exports what the filters select", async ({ page }) => {
    await page.goto("/admin/audit?actions=role.created");

    const download = page.waitForEvent("download");
    await page.getByTestId("audit-export").click();

    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^audit-log-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    await expectToast(page, /Exported \d+ entries/);
  });

  test("cleans up the role it created", async ({ page }) => {
    await page.goto("/admin/roles");

    await page
      .getByTestId("role-card-Audited Role")
      .getByRole("button", { name: "Delete" })
      .click();
    await page.getByRole("button", { name: "Delete role" }).click();
    await expectToast(page, 'Deleted "Audited Role".');

    await closeOverlays(page);
  });
});

test.describe("audit log access", () => {
  test.use({ storageState: storageStatePath("employee") });

  test("is closed to someone without the permission", async ({ page }) => {
    const response = await page.goto("/admin/audit");
    expect(response?.status()).toBe(403);
  });
});
