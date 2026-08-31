import { expect, test } from "@playwright/test";

import { clearMailbox, storageStatePath, waitForEmail } from "./helpers";

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

    await expect(page.getByText("Role created.")).toBeVisible();
    const card = page.getByTestId(`role-card-${NEW_ROLE}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText("Review applications");
  });

  test("rejects a duplicate role name", async ({ page }) => {
    await page.goto("/admin/roles");

    await page.getByTestId("new-role").click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(NEW_ROLE);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(
      page.getByText("A role with that name already exists."),
    ).toBeVisible();
  });

  test("refuses to delete a role that is still in use", async ({ page }) => {
    await page.goto("/admin/roles");

    // Dean both holds members and is bound to a workflow stage; either guard
    // is a correct refusal, and the role must survive the attempt.
    const card = page.getByTestId("role-card-Dean");
    await card.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete role" }).click();

    await expect(
      page.getByText(/still assigned this role|assigned to workflow stage/),
    ).toBeVisible();
    await expect(card).toBeVisible();
  });

  test("cannot narrow the super admin role", async ({ page }) => {
    await page.goto("/admin/roles");

    await page
      .getByTestId("role-card-Super Admin")
      .getByRole("button", { name: "Edit" })
      .click();
    await expect(
      page.getByText("The Super Admin role always holds every permission"),
    ).toBeVisible();
  });

  test("deletes an unused role", async ({ page }) => {
    await page.goto("/admin/roles");

    await page
      .getByTestId(`role-card-${NEW_ROLE}`)
      .getByRole("button", { name: "Delete" })
      .click();
    await page.getByRole("button", { name: "Delete role" }).click();

    await expect(page.getByText(`Deleted "${NEW_ROLE}".`)).toBeVisible();
    await expect(page.getByTestId(`role-card-${NEW_ROLE}`)).toHaveCount(0);
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
    await page
      .getByRole("textbox", { name: "Department", exact: true })
      .fill("Civil Engineering");
    await page.getByRole("checkbox", { name: "Faculty" }).click();
    await page.getByRole("button", { name: "Add user" }).click();

    await expect(page.getByText(/whitelisted/)).toBeVisible();

    const row = page.getByTestId(`user-${INVITEE}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Invited");
    await expect(row).toContainText("Faculty");

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

    await expect(
      page.getByText("That email is already on the whitelist."),
    ).toBeVisible();
  });

  test("disables and re-enables an account", async ({ page }) => {
    await page.goto("/admin/users");

    const row = page.getByTestId(`user-${INVITEE}`);
    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Disable access" }).click();
    await expect(page.getByText("Account disabled.")).toBeVisible();
    await expect(row).toContainText("Disabled");

    await row.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Re-enable access" }).click();
    await expect(page.getByText("Account re-enabled.")).toBeVisible();
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

    await expect(page.getByText("User removed.")).toBeVisible();
    await expect(page.getByTestId(`user-${INVITEE}`)).toHaveCount(0);
  });

  test("filters the user list", async ({ page }) => {
    await page.goto("/admin/users");

    await page
      .getByRole("textbox", { name: "Search users" })
      .fill("hod@manipal.edu");
    await expect(page.getByTestId("user-hod@manipal.edu")).toBeVisible();
    await expect(page.getByTestId("user-dean@manipal.edu")).toHaveCount(0);
  });
});

test.describe("email templates", () => {
  test("creates a template with hydrated placeholders", async ({ page }) => {
    await page.goto("/admin/templates");

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
    await expect(page.getByText("Template created.")).toBeVisible();
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

    await expect(
      page.getByText("Test email sent to your inbox."),
    ).toBeVisible();
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

    await expect(page.getByText(/used by email step/)).toBeVisible();
  });

  test("deletes an unused template", async ({ page }) => {
    await page.goto("/admin/templates");

    await page.getByRole("button", { name: `Delete ${NEW_TEMPLATE}` }).click();
    await page.getByRole("button", { name: "Delete template" }).click();

    await expect(page.getByText("Template deleted.")).toBeVisible();
    await expect(page.getByTestId(`template-${NEW_TEMPLATE}`)).toHaveCount(0);
  });
});
