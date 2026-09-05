import { expect, test, type Page } from "@playwright/test";

import { closeOverlays, expectToast, storageStatePath } from "./helpers";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: storageStatePath("superAdmin") });

const NEW_DEPARTMENT = "Department of Test Engineering";

/** One account's row in user administration, which carries its role badges. */
async function rowFor(page: Page, email: string) {
  await page.goto("/admin/users");
  await page.getByRole("textbox", { name: "Search users" }).fill(email);
  return page.getByTestId(`user-${email}`);
}

test.describe("departments", () => {
  test("lists the departments a fresh install starts with", async ({
    page,
  }) => {
    await page.goto("/admin/departments");

    await expect(page.getByTestId("department-card-Engineering")).toBeVisible();
    await expect(page.getByTestId("department-card-Finance")).toBeVisible();
  });

  test("adds one with a head and two deputies", async ({ page }) => {
    await page.goto("/admin/departments");
    await page.getByTestId("new-department").click();

    await page.getByLabel("Name").fill(NEW_DEPARTMENT);
    await page.getByLabel("Short form").fill("STE");

    // Both pickers search rather than listing every account. The people
    // chosen here are ones no other spec reviews as, because being appointed
    // grants them the head and deputy roles for as long as the department
    // exists.
    await page.getByTestId("department-head").click();
    await page.getByTestId("department-head-search").fill("admin@");
    await page.getByTestId("department-head-admin@example.org").click();

    for (const email of ["records@example.org", "approver@example.org"]) {
      await page.getByTestId("department-deputy").click();
      await page.getByTestId("department-deputy-search").fill(email);
      await page.getByTestId(`department-deputy-${email}`).click();
    }

    await expect(page.getByTestId("chosen-deputies")).toContainText(
      "Test Records Officer",
    );

    await page.getByTestId("save-department").click();
    await expectToast(page, "Department created.");

    const card = page.getByTestId(`department-card-${NEW_DEPARTMENT}`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId(`head-${NEW_DEPARTMENT}`)).toContainText(
      "Super Admin",
    );
    await expect(page.getByTestId(`deputies-${NEW_DEPARTMENT}`)).toContainText(
      "Test Approver",
    );
  });

  test("gives the people it appoints the roles that go with the post", async ({
    page,
  }) => {
    await expect(await rowFor(page, "records@example.org")).toContainText(
      "Deputy",
    );
  });

  test("refuses a duplicate name", async ({ page }) => {
    await page.goto("/admin/departments");
    await page.getByTestId("new-department").click();
    await page.getByLabel("Name").fill(NEW_DEPARTMENT);
    await page.getByTestId("save-department").click();

    await expectToast(page, "A department with that name already exists.");
    await closeOverlays(page);
  });

  test("offers its departments when editing a user", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .getByRole("textbox", { name: "Search users" })
      .fill("applicant@example.org");

    const editPagePromise = page.context().waitForEvent("page");
    await page
      .getByTestId("user-applicant@example.org")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit details and roles" })
      .click();
    const editPage = await editPagePromise;

    // Seeded with a department, and the others are there to move them to.
    await expect(editPage.getByTestId("user-department")).toContainText(
      "Engineering",
    );
    await editPage.getByTestId("user-department").click();
    await expect(
      editPage.getByRole("option", {
        name: "Finance",
      }),
    ).toBeVisible();

    await editPage.close();
  });

  test("refuses to delete a department that still holds accounts", async ({
    page,
  }) => {
    await page.goto("/admin/departments");

    await page
      .getByRole("button", {
        name: "Delete Engineering",
      })
      .click();
    await page.getByTestId("confirm-delete-department").click();

    await expectToast(page, /accounts? belong/);
  });

  test("deletes the empty one it created", async ({ page }) => {
    await page.goto("/admin/departments");

    await page
      .getByRole("button", { name: `Delete ${NEW_DEPARTMENT}` })
      .click();
    await page.getByTestId("confirm-delete-department").click();

    await expectToast(page, `Deleted "${NEW_DEPARTMENT}".`);
    await expect(
      page.getByTestId(`department-card-${NEW_DEPARTMENT}`),
    ).toHaveCount(0);

    // And the roles that came with the posts go with them.
    await expect(await rowFor(page, "records@example.org")).not.toContainText(
      "Deputy",
    );
  });
});
