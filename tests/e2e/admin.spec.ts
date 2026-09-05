import { expect, test } from "@playwright/test";

import {
  clearMailbox,
  closeOverlays,
  expectToast,
  storageStatePath,
  waitForEmail,
} from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ storageState: storageStatePath("superAdmin") });

const NEW_ROLE = "External Examiner";
const NEW_TEMPLATE = "Committee Reminder";
const INVITEE = "e2e.invitee@manipal.edu";

test.describe("role administration", () => {
  test("creates a role with the chosen permissions", async ({ page }) => {
    await page.goto("/admin/roles");

    await page.getByTestId("new-role").click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(NEW_ROLE);
    await page
      .getByLabel("Description")
      .fill("Reviews applications from outside the institute.");
    await page
      .getByRole("checkbox", { name: "Review applications" })
      .first()
      .click();
    await page.getByRole("button", { name: "Create role" }).click();

    await expectToast(page, "Role created.");
    // The row counts what the role can do rather than listing it, so the
    // table stays readable as roles grow.
    const row = page.getByTestId(`role-${NEW_ROLE}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("1");
  });

  test("opens a role to say what it grants and who holds it", async ({
    page,
  }) => {
    await page.goto("/admin/roles");
    await page.getByTestId("open-role-Head").click();

    const detail = page.getByTestId("role-detail");
    await expect(detail).toBeVisible();
    // Spelled out here, which is why the table no longer has to.
    await expect(detail).toContainText("Review applications");
    await expect(detail).toContainText("Head of a department");

    // Its members, searchable, and each one a way into their own record.
    await expect(detail.getByTestId("role-members")).toContainText("Test Head");
    await detail.getByTestId("member-search").fill("nobody-by-that-name");
    await expect(detail).toContainText("Nobody matches that search.");
    await detail.getByTestId("member-search").fill("head@manipal.edu");

    const userPagePromise = page.context().waitForEvent("page");
    await detail.getByRole("link", { name: "Open" }).first().click();
    const userPage = await userPagePromise;
    await expect(userPage).toHaveURL(/\/users\/[a-zA-Z0-9_-]+/);
    await expect(userPage.getByTestId("user-detail")).toContainText(
      "head@manipal.edu",
    );
    await userPage.close();
  });

  test("rejects a duplicate role name", async ({ page }) => {
    await page.goto("/admin/roles");

    await page.getByTestId("new-role").click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(NEW_ROLE);
    await page.getByRole("button", { name: "Create role" }).click();

    await expectToast(page, "A role with that name already exists.");
  });

  test("refuses to delete a role that is still in use", async ({ page }) => {
    await page.goto("/admin/roles");

    // Head both holds members and is bound to a workflow stage; either guard
    // is a correct refusal, and the role must survive the attempt.
    const card = page.getByTestId("role-Director");
    await card.getByRole("button", { name: "Delete Director" }).click();
    await page.getByRole("button", { name: "Delete role" }).click();

    await expectToast(
      page,
      /still assigned this role|assigned to workflow stage/,
    );
    await expect(card).toBeVisible();
  });

  test("cannot narrow the super admin role", async ({ page }) => {
    await page.goto("/admin/roles");

    await page
      .getByTestId("role-Super Admin")
      .getByRole("button", { name: "Edit Super Admin" })
      .click();
    await expect(
      page.getByText("The Super Admin role always holds every permission"),
    ).toBeVisible();
  });

  test("deletes an unused role", async ({ page }) => {
    await page.goto("/admin/roles");

    await page
      .getByTestId(`role-${NEW_ROLE}`)
      .getByRole("button", { name: `Delete ${NEW_ROLE}` })
      .click();
    await page.getByRole("button", { name: "Delete role" }).click();

    await expectToast(page, `Deleted "${NEW_ROLE}".`);
    await expect(page.getByTestId(`role-${NEW_ROLE}`)).toHaveCount(0);
  });
});

test.describe("user administration", () => {
  test("whitelists an address and emails an activation link", async ({
    page,
  }) => {
    await clearMailbox();
    await page.goto("/admin/users");

    await page.getByTestId("invite-user").click();
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(INVITEE);
    await page
      .getByRole("textbox", { name: "Display name" })
      .fill("E2E Invitee");
    await page.getByTestId("user-department").click();
    await page
      .getByRole("option", {
        name: "Department of Civil & Chemical Engineering",
      })
      .click();
    await page.getByRole("checkbox", { name: "Employee", exact: true }).click();
    await page.getByRole("button", { name: "Add user" }).click();

    await expectToast(page, /whitelisted/);

    const row = page.getByTestId(`user-${INVITEE}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Invited");
    await expect(row).toContainText("Employee");

    const mail = await waitForEmail((message) => message.To.includes(INVITEE));
    expect(mail.Subject).toContain("Activate");
  });

  test("rejects an address that is already whitelisted", async ({ page }) => {
    await page.goto("/admin/users");

    await page.getByTestId("invite-user").click();
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(INVITEE);
    await page.getByRole("textbox", { name: "Display name" }).fill("Duplicate");
    await page.getByRole("button", { name: "Add user" }).click();

    await expectToast(page, "That email is already on the whitelist.");
  });

  test("disables and re-enables an account", async ({ page }) => {
    await page.goto("/admin/users");

    const row = page.getByTestId(`user-${INVITEE}`);
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Disable access" }).click();
    await expectToast(page, "Account disabled.");
    await expect(row).toContainText("Disabled");

    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Re-enable access" }).click();
    await expectToast(page, "Account re-enabled.");
  });

  test("cannot disable your own account", async ({ page }) => {
    await page.goto("/admin/users");

    const row = page.getByTestId("user-superadmin@manipal.edu");
    await row.getByRole("button", { name: /Actions for/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Disable access" }),
    ).toBeDisabled();
  });

  test("removes a whitelisted account with no applications", async ({
    page,
  }) => {
    await page.goto("/admin/users");

    const row = page.getByTestId(`user-${INVITEE}`);
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Remove from whitelist" }).click();
    await page.getByRole("button", { name: "Remove user" }).click();

    await expectToast(page, "User removed.");
    await expect(page.getByTestId(`user-${INVITEE}`)).toHaveCount(0);
  });

  test("records the particulars the promotion form asks for", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await page
      .getByRole("textbox", { name: "Search users" })
      .fill("employee@manipal.edu");
    const editPagePromise = page.context().waitForEvent("page");
    await page
      .getByTestId("user-employee@manipal.edu")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit details and roles" })
      .click();
    const editPage = await editPagePromise;

    // Seeded from the demo service record, and editable here.
    await expect(editPage.getByTestId("user-date-of-joining")).toHaveValue(
      "2017-06-01",
    );
    await editPage.getByTestId("user-date-of-birth").fill("1984-02-12");
    await editPage.getByTestId("user-type").click();
    await editPage.getByRole("option", { name: "Contract" }).click();
    await editPage.getByRole("button", { name: "Save changes" }).click();
    await expectToast(editPage, "User updated.");
    await editPage.close();

    await expect(page.getByTestId("user-employee@manipal.edu")).toContainText(
      "Contract",
    );

    // Put it back: the lifecycle spec runs against this account.
    const editPage2Promise = page.context().waitForEvent("page");
    await page
      .getByTestId("user-employee@manipal.edu")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit details and roles" })
      .click();
    const editPage2 = await editPage2Promise;
    await editPage2.getByTestId("user-date-of-birth").fill("1984-02-11");
    await editPage2.getByTestId("user-type").click();
    await editPage2.getByRole("option", { name: "Regular" }).click();
    await editPage2.getByRole("button", { name: "Save changes" }).click();
    await expectToast(editPage2, "User updated.");
    await editPage2.close();
  });

  test("filters the user list", async ({ page }) => {
    await page.goto("/admin/users");

    await page
      .getByRole("textbox", { name: "Search users" })
      .fill("head@manipal.edu");

    // The rows the search matches stay; everyone else goes.
    await expect(page.getByTestId("user-head@manipal.edu")).toBeVisible();
    await expect(page.getByTestId("user-employee@manipal.edu")).toHaveCount(0);
  });
});

test.describe("who may apply", () => {
  test("closes the form to someone on contract, and opens it again", async ({
    page,
  }) => {
    async function setEmployment(type: string) {
      await page.goto("/admin/users");
      await page
        .getByRole("textbox", { name: "Search users" })
        .fill("employee@manipal.edu");
      const editPagePromise = page.context().waitForEvent("page");
      await page
        .getByTestId("user-employee@manipal.edu")
        .getByRole("button", { name: /Actions for/ })
        .click();
      await page
        .getByRole("menuitem", { name: "Edit details and roles" })
        .click();
      const editPage = await editPagePromise;
      await editPage.getByTestId("user-type").click();
      await editPage.getByRole("option", { name: type, exact: true }).click();
      await editPage.getByRole("button", { name: "Save changes" }).click();
      await expectToast(editPage, "User updated.");
      await editPage.close();
    }

    await setEmployment("Contract");

    // Seen from their own account: said plainly, with no button that would
    // only fail.
    await page
      .getByTestId("user-employee@manipal.edu")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page.getByRole("menuitem", { name: "View as this user" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("dashboard-primary-action")).toBeDisabled();

    await page.goto("/application");
    await expect(page.getByTestId("not-eligible")).toContainText(
      "appointed on contract are not eligible",
    );
    await expect(page.getByTestId("start-application")).toHaveCount(0);

    await page.getByTestId("stop-impersonating").click();
    await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);

    // Put back, so the rest of the suite has somebody who can apply.
    await setEmployment("Regular");
  });
});

test.describe("one account, in full", () => {
  test("opens from the row and shows what they have applied for", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await page
      .getByRole("textbox", { name: "Search users" })
      .fill("employee@manipal.edu");
    const userPagePromise = page.context().waitForEvent("page");
    await page.getByTestId("open-user-employee@manipal.edu").click();
    const userPage = await userPagePromise;

    const detail = userPage.getByTestId("user-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("TEST-0001");
    await expect(detail).toContainText("Department of Computer Engineering");
    await expect(detail).toContainText("Regular");
    // What they have applied for is the point of opening the record; whether
    // they have applied yet depends on what else has run.
    await expect(detail).toContainText("Their applications");

    // And straight from reading into changing.
    await detail.getByTestId("edit-from-detail").click();
    await expect(userPage.getByTestId("user-date-of-birth")).toBeVisible();
    await userPage.close();
  });
});

test.describe("email templates", () => {
  test("creates a template with hydrated placeholders", async ({ page }) => {
    await page.goto("/admin/templates");

    // A retry re-runs the whole serial file, and the name is unique: clear a
    // leftover first so the retry fails on the real problem, not on the name.
    const existing = page.getByTestId(`template-${NEW_TEMPLATE}`);
    if (await existing.isVisible()) {
      await page
        .getByRole("button", { name: `Delete ${NEW_TEMPLATE}` })
        .click();
      await page.getByRole("button", { name: "Delete template" }).click();
      await expectToast(page, "Template deleted.");
    }

    await page.getByTestId("new-template").click();
    await page
      .getByRole("textbox", { name: "Template name" })
      .fill(NEW_TEMPLATE);
    await page
      .getByLabel("Subject line")
      .fill("Reminder for {{application_reference}}");

    const body = page.getByTestId("rich-text-body");
    await body.click();
    await body.pressSequentially("Please review before Friday. ");
    await page
      .getByRole("button", { name: "{{applicant_name}}" })
      .first()
      .click();

    await page.getByTestId("save-template").click();
    await expectToast(page, "Template created.");
    await expect(page.getByTestId(`template-${NEW_TEMPLATE}`)).toBeVisible();
  });

  test("sends a test email using sample data", async ({ page }) => {
    await clearMailbox();
    await page.goto("/admin/templates");

    await page
      .getByTestId(`template-${NEW_TEMPLATE}`)
      .getByRole("button", { name: "Edit template" })
      .click();
    await page.getByRole("button", { name: "Send test to me" }).click();

    await expectToast(page, "Test email sent to your inbox.");
    const mail = await waitForEmail((message) =>
      message.Subject.startsWith("[Test]"),
    );
    // The placeholder must have been replaced with the sample reference.
    expect(mail.Subject).toContain("PROM-2026-0001");
  });

  test("refuses to delete a template an email step still uses", async ({
    page,
  }) => {
    await page.goto("/admin/templates");

    await page
      .getByRole("button", { name: "Delete Application Received" })
      .click();
    await page.getByRole("button", { name: "Delete template" }).click();

    await expectToast(page, /used by email step/);
  });

  test("inserts a clickable button into the body", async ({ page }) => {
    await page.goto("/admin/templates");

    await page
      .getByTestId(`template-${NEW_TEMPLATE}`)
      .getByRole("button", { name: "Edit template" })
      .click();

    const body = page.getByTestId("rich-text-body");
    await body.click();
    await page.getByRole("button", { name: "Insert button" }).click();

    // Any address will do: the author types one rather than picking from a
    // fixed list of portal links.
    await page.getByTestId("link-label").fill("Open your application");
    await page
      .getByTestId("link-href")
      .fill("http://localhost:3000/applications");
    await page.getByTestId("link-apply").click();

    const button = body.locator("[data-email-button]");
    await expect(button).toHaveText("Open your application");
    await expect(button).toHaveAttribute(
      "href",
      "http://localhost:3000/applications",
    );

    await page.getByTestId("save-template").click();
    await expectToast(page, "Template saved.");

    // It survives the round trip through the stored HTML.
    await page.reload();
    await page
      .getByTestId(`template-${NEW_TEMPLATE}`)
      .getByRole("button", { name: "Edit template" })
      .click();
    await expect(
      page.getByTestId("rich-text-body").locator("[data-email-button]"),
    ).toHaveText("Open your application");
    await closeOverlays(page);
  });

  test("deletes an unused template", async ({ page }) => {
    await page.goto("/admin/templates");

    await page.getByRole("button", { name: `Delete ${NEW_TEMPLATE}` }).click();
    await page.getByRole("button", { name: "Delete template" }).click();

    await expectToast(page, "Template deleted.");
    await expect(page.getByTestId(`template-${NEW_TEMPLATE}`)).toHaveCount(0);
  });
});
