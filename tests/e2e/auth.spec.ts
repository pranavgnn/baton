import { expect, test } from "@playwright/test";

import { ACCOUNTS, signOut, storageStatePath } from "./helpers";

test.describe("unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects every signed-in area to the sign-in page", async ({
    page,
  }) => {
    for (const route of ["/dashboard", "/admin/workflow", "/reviews"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/sign-in/);
    }
  });

  test("rejects wrong credentials without saying which part failed", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Institute email").fill(ACCOUNTS.employee.email);
    await page.getByLabel("Password", { exact: true }).fill("WrongPassword1");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("never leaks whether an address is on the whitelist", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Institute email").fill("nobody@example.com");
    await page.getByRole("button", { name: "Send me a link" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();
  });

  test("offers a recovery path for a reset link that cannot be used", async ({
    page,
  }) => {
    // Rejected outright, and arrived at with nothing to reject.
    for (const route of [
      "/reset-password?error=INVALID_TOKEN",
      "/reset-password",
    ]) {
      await page.goto(route);
      await expect(page.getByText("Link not valid")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Request a new link" }),
      ).toBeVisible();
    }
  });
});

test.describe("applicant permissions", () => {
  test.use({ storageState: storageStatePath("employee") });

  test("sees only the navigation their role allows", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /Welcome back/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "My Application" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Reviews" })).toHaveCount(0);
  });

  test("is blocked from everything their role does not cover", async ({
    page,
  }) => {
    for (const route of ["/admin/roles", "/reviews", "/applications"]) {
      await page.goto(route);
      await expect(
        page.getByText("You do not have access to this page"),
      ).toBeVisible();
    }
  });

  test("can sign out", async ({ page }) => {
    await page.goto("/dashboard");
    await signOut(page);
  });
});

test.describe("reviewer permissions", () => {
  test.use({ storageState: storageStatePath("dean") });

  test("gets the review queue but not the admin area", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Reviews" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await page.goto("/admin");
    await expect(
      page.getByText("You do not have access to this page"),
    ).toBeVisible();
  });
});

test.describe("administrator permissions", () => {
  test.use({ storageState: storageStatePath("superAdmin") });

  test("reaches every area of the portal", async ({ page }) => {
    await page.goto("/dashboard");
    for (const link of [
      "Dashboard",
      "My Application",
      "Reviews",
      "All Applications",
      "Admin",
    ]) {
      await expect(page.getByRole("link", { name: link })).toBeVisible();
    }
  });
});
