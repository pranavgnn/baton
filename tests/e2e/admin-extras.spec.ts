import { expect, test, type Page } from "@playwright/test";

import { closeOverlays, expectToast, storageStatePath } from "./helpers";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: storageStatePath("superAdmin") });

test.describe("role priority", () => {
  test("saves a reordered list, and the default follows it", async ({
    page,
  }) => {
    await page.goto("/admin/roles");

    // The seed puts Applicant first, so it is what an unnamed user is given.
    await expect(
      page.getByTestId("role-Applicant").getByText("Default"),
    ).toBeVisible();

    await page.getByTestId("open-role-priority").click();
    await expect(page.getByTestId("role-priority-dialog")).toBeVisible();

    const rows = page.getByTestId("priority-list").locator("li");
    await expect(rows.first()).toContainText("Applicant");
    await expect(rows.first()).toContainText("Default");

    await dragRole(page, "Applicant", 1);

    await page.getByTestId("save-priority").click();
    await expectToast(page, "Role priority saved.");

    await page.reload();
    // The default badge follows the top of the list, wherever that now is.
    await expect(
      page.getByTestId("role-Applicant").getByText("Default"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("role-Department Head").getByText("Default"),
    ).toBeVisible();

    // And back, which is both the other direction and the tidy-up.
    await page.getByTestId("open-role-priority").click();
    await dragRole(page, "Applicant", -1);
    await page.getByTestId("save-priority").click();
    await expectToast(page, "Role priority saved.");

    await page.reload();
    await expect(
      page.getByTestId("role-Applicant").getByText("Default"),
    ).toBeVisible();
  });
});

/**
 * Drags a role `places` rows down the priority dialog (negative moves it up).
 *
 * dnd-kit's pointer sensor needs a real gesture: a press, a move past its 4px
 * activation distance, then the travel in steps so the sortable list can
 * measure and shift as the pointer passes each row.
 */
async function dragRole(page: Page, name: string, places: number) {
  const handle = page.getByRole("button", { name: `Reorder ${name}` });
  const row = page.getByTestId(`priority-${name}`);

  const from = (await handle.boundingBox())!;
  const height = (await row.boundingBox())!.height;
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 8);

  const distance = height * places;
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(startX, startY + (distance * step) / 10);
  }

  await page.mouse.up();
  await expect(
    page.getByTestId("priority-list").locator("li").first(),
  ).toBeVisible();
}

/** Points one portal field at a column of the uploaded file. */
async function mapColumn(page: Page, field: string, column: string) {
  await page.getByTestId(`map-${field}`).click();
  await page.getByRole("option", { name: column, exact: true }).click();
}

test.describe("bulk user import", () => {
  const IMPORTED = "bulk.one@example.org";
  const SECOND = "bulk.two@example.org";
  const FOURTH = "bulk.four@example.org";

  test("previews a pasted CSV before writing anything", async ({ page }) => {
    await page.goto("/admin/users");
    await page.getByTestId("bulk-import").click();

    await page
      .getByTestId("import-csv")
      .fill(
        `email,name,department,roles\n${IMPORTED},Bulk One,Finance,Applicant\n${SECOND},Bulk Two,Finance,\nnot-an-email,Broken,,`,
      );

    const preview = page.getByTestId("import-preview");
    await expect(preview).toContainText(IMPORTED);
    await expect(preview).toContainText(SECOND);

    // The bad row is reported, not silently dropped.
    await expect(page.getByTestId("import-issues")).toContainText(
      "is not a valid email address",
    );

    // Still nothing written.
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("textbox", { name: "Search users" }).fill("bulk.");
    await expect(page.getByTestId(`user-${IMPORTED}`)).toHaveCount(0);
  });

  test("imports the valid rows and applies the default role", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await page.getByTestId("bulk-import").click();

    await page
      .getByTestId("import-csv")
      .fill(
        `email,name,department,roles\n${IMPORTED},Bulk One,Finance,Applicant\n${SECOND},Bulk Two,Finance,`,
      );
    await page.getByTestId("confirm-import").click();

    await expectToast(page, /Imported 2/);

    await page.getByRole("textbox", { name: "Search users" }).fill("bulk.");
    await expect(page.getByTestId(`user-${IMPORTED}`)).toContainText(
      "Applicant",
    );
    // The row naming no role falls back to the default.
    await expect(page.getByTestId(`user-${SECOND}`)).toContainText("Applicant");
  });

  test("skips addresses already on the whitelist", async ({ page }) => {
    await page.goto("/admin/users");
    await page.getByTestId("bulk-import").click();

    await page.getByTestId("import-csv").fill(`email\n${IMPORTED}`);
    await page.getByTestId("confirm-import").click();

    await expectToast(page, /skipped 1/);
  });

  test("imports a pasted list of addresses", async ({ page }) => {
    await page.goto("/admin/users");
    await page.getByTestId("bulk-import").click();

    await page.getByRole("tab", { name: "Paste addresses" }).click();
    await page
      .getByTestId("import-list")
      .fill("Bulk Three <bulk.three@example.org>");

    await expect(page.getByTestId("import-preview")).toContainText(
      "Bulk Three",
    );
    await page.getByTestId("confirm-import").click();
    await expectToast(page, /Imported 1/);
  });

  test("maps columns by hand when a file names them its own way", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await page.getByTestId("bulk-import").click();

    // An institute's own export: no column is named anything the portal
    // recognises, and they are in the wrong order.
    await page
      .getByTestId("import-csv")
      .fill(`staff no,who,mail id\nEMP-9001,Bulk Four,${FOURTH}`);

    // Nothing is guessed, so nothing imports until the columns are named.
    await expect(page.getByTestId("import-mapping")).toBeVisible();
    await expect(page.getByTestId("confirm-import")).toBeDisabled();

    await mapColumn(page, "email", "mail id");
    await mapColumn(page, "name", "who");
    await mapColumn(page, "employeeId", "staff no");

    await expect(page.getByTestId("import-preview")).toContainText("Bulk Four");
    await page.getByTestId("confirm-import").click();
    await expectToast(page, /Imported 1/);

    // The employee code came through, so the mapping reached the database and
    // not just the preview.
    await page.getByRole("textbox", { name: "Search users" }).fill("EMP-9001");
    await expect(page.getByTestId(`user-${FOURTH}`)).toBeVisible();
  });

  test("cleans up the imported accounts", async ({ page }) => {
    await page.goto("/admin/users");

    for (const email of [IMPORTED, SECOND, "bulk.three@example.org", FOURTH]) {
      await page.getByRole("textbox", { name: "Search users" }).fill(email);
      const row = page.getByTestId(`user-${email}`);
      await row.getByRole("button", { name: /Actions for/ }).click();
      await page
        .getByRole("menuitem", { name: "Remove from whitelist" })
        .click();
      await page.getByRole("button", { name: "Remove user" }).click();
      await expectToast(page, "User removed.");
    }
  });
});

test.describe("action menus", () => {
  test("sizes a row's action menu to its longest label", async ({ page }) => {
    await page.goto("/admin/users");

    const trigger = page.getByRole("button", { name: /Actions for/ }).first();
    // Measured first: an open menu takes the rest of the page out of the
    // accessibility tree, trigger included.
    const triggerBox = (await trigger.boundingBox())!;
    await trigger.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // The menu used to inherit the icon button's width, which folded every
    // label onto three or four lines.
    const item = page.getByRole("menuitem", { name: "Remove from whitelist" });
    const wrapped = await item.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(wrapped).toBe(false);

    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.width).toBeGreaterThan(triggerBox.width * 3);

    await closeOverlays(page);
  });
});

test.describe("pagination", () => {
  test("offers page controls on every long list", async ({ page }) => {
    for (const route of ["/admin/users", "/admin/roles", "/admin/templates"]) {
      await page.goto(route);
      await expect(page.getByTestId("pagination")).toBeVisible();
    }

    // One page of results, so there is nowhere to go.
    await page.goto("/admin/users");
    await expect(page.getByTestId("page-number")).toHaveValue("1");
    await expect(page.getByTestId("page-previous")).toBeDisabled();

    await page.getByRole("combobox", { name: "Rows per page" }).click();
    await page.getByRole("option", { name: "10 per page" }).click();
    await expect(page.getByTestId("page-indicator")).toBeVisible();
  });
});

test.describe("account", () => {
  test("refuses a change it cannot accept", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByTestId("change-password").click();
    await expect(page.getByTestId("change-password-dialog")).toBeVisible();

    // Caught in the browser, before anything is sent.
    await page.getByLabel("Current password").fill("SuperAdmin@123");
    await page.getByLabel("New password", { exact: true }).fill("Newpass@123");
    await page.getByLabel("Confirm new password").fill("Different@123");
    await page.getByTestId("save-password").click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();

    // And caught by the server, which is the one that matters.
    await page.getByLabel("Current password").fill("DefinitelyWrong1");
    await page.getByLabel("Confirm new password").fill("Newpass@123");
    await page.getByTestId("save-password").click();
    await expect(
      page.getByTestId("change-password-dialog").getByRole("alert"),
    ).toBeVisible();
  });
});
