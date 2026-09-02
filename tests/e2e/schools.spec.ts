import { expect, test, type Page } from "@playwright/test";

import { closeOverlays, expectToast, storageStatePath } from "./helpers";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: storageStatePath("superAdmin") });

const NEW_SCHOOL = "School of Test Engineering";

/** One account's row in user administration, which carries its role badges. */
async function rowFor(page: Page, email: string) {
  await page.goto("/admin/users");
  await page.getByRole("textbox", { name: "Search users" }).fill(email);
  return page.getByTestId(`user-${email}`);
}

test.describe("schools", () => {
  test("lists the schools a fresh install starts with", async ({ page }) => {
    await page.goto("/admin/schools");

    await expect(
      page.getByTestId("school-card-School of Computer Engineering"),
    ).toBeVisible();
    await expect(
      page.getByTestId("school-card-School of Electrical Engineering"),
    ).toBeVisible();
  });

  test("adds one with a dean and two associate deans", async ({ page }) => {
    await page.goto("/admin/schools");
    await page.getByTestId("new-school").click();

    await page.getByLabel("Name").fill(NEW_SCHOOL);
    await page.getByLabel("Short form").fill("STE");

    // Both pickers search rather than listing every account. The people
    // chosen here are ones no other spec reviews as, because being appointed
    // grants them the dean and associate dean roles for as long as the school
    // exists.
    await page.getByTestId("school-dean").click();
    await page.getByTestId("school-dean-search").fill("superadmin@");
    await page.getByTestId("school-dean-superadmin@manipal.edu").click();

    for (const email of [
      "institutehr@manipal.edu",
      "associatedirector@manipal.edu",
    ]) {
      await page.getByTestId("school-associate-dean").click();
      await page.getByTestId("school-associate-dean-search").fill(email);
      await page.getByTestId(`school-associate-dean-${email}`).click();
    }

    await expect(page.getByTestId("chosen-associate-deans")).toContainText(
      "Test Institute HR",
    );

    await page.getByTestId("save-school").click();
    await expectToast(page, "School created.");

    const card = page.getByTestId(`school-card-${NEW_SCHOOL}`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId(`dean-${NEW_SCHOOL}`)).toContainText(
      "Super Admin",
    );
    await expect(
      page.getByTestId(`associate-deans-${NEW_SCHOOL}`),
    ).toContainText("Test Associate Director");
  });

  test("gives the people it appoints the roles that go with the post", async ({
    page,
  }) => {
    await expect(await rowFor(page, "institutehr@manipal.edu")).toContainText(
      "Associate Dean",
    );
  });

  test("refuses a duplicate name", async ({ page }) => {
    await page.goto("/admin/schools");
    await page.getByTestId("new-school").click();
    await page.getByLabel("Name").fill(NEW_SCHOOL);
    await page.getByTestId("save-school").click();

    await expectToast(page, "A school with that name already exists.");
    await closeOverlays(page);
  });

  test("offers its schools when editing a user", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .getByRole("textbox", { name: "Search users" })
      .fill("employee@manipal.edu");

    await page
      .getByTestId("user-employee@manipal.edu")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit details and roles" })
      .click();

    // Seeded with a school, and the others are there to move them to.
    await expect(page.getByTestId("user-school")).toContainText(
      "School of Computer Engineering",
    );
    await page.getByTestId("user-school").click();
    await expect(
      page.getByRole("option", { name: "School of Electrical Engineering" }),
    ).toBeVisible();

    await closeOverlays(page);
  });

  test("refuses to delete a school that still holds accounts", async ({
    page,
  }) => {
    await page.goto("/admin/schools");

    await page
      .getByRole("button", { name: "Delete School of Computer Engineering" })
      .click();
    await page.getByTestId("confirm-delete-school").click();

    await expectToast(page, /accounts? belong/);
  });

  test("deletes the empty one it created", async ({ page }) => {
    await page.goto("/admin/schools");

    await page.getByRole("button", { name: `Delete ${NEW_SCHOOL}` }).click();
    await page.getByTestId("confirm-delete-school").click();

    await expectToast(page, `Deleted "${NEW_SCHOOL}".`);
    await expect(page.getByTestId(`school-card-${NEW_SCHOOL}`)).toHaveCount(0);

    // And the roles that came with the posts go with them.
    await expect(
      await rowFor(page, "institutehr@manipal.edu"),
    ).not.toContainText("Associate Dean");
  });
});
