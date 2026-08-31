import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  clearMailbox,
  selectOption,
  storageStatePath,
  waitForEmail,
} from "./helpers";

const FIXTURE_CV = path.join(__dirname, "fixtures", "curriculum-vitae.pdf");

/**
 * Drives the whole promotion pipeline against a real database, MinIO and SMTP
 * sink: submission, a send-back loop, resubmission, HOD recommendation and
 * final Dean approval. The blocks run in declaration order and share one
 * application, so each one depends on the state the previous left behind.
 */
test.describe.configure({ mode: "serial" });

const APPLICANT = "Dr. Nikhil Prabhu";

async function fillPersonalDetails(page: Page) {
  await page.getByLabel("Full name").fill(APPLICANT);
  await page.getByLabel("Employee ID").fill("MIT-7788");
  await page.getByLabel("Institute email").fill("faculty@manipal.edu");
  await page.getByLabel("Contact number").fill("+91 99000 11223");
  await selectOption(page, "Department", "Computer Science & Engineering");
  await selectOption(page, "Current designation", "Assistant Professor");
  await page.getByLabel("Date of joining").fill("2017-06-01");
  await selectOption(page, "Designation applied for", "Associate Professor");
}

async function fillAcademicRecord(page: Page) {
  await page
    .getByLabel("Highest qualification")
    .fill("Ph.D. in Information Security");
  await page.getByLabel("Years of teaching experience").fill("9");
  await page.getByLabel("Peer-reviewed publications").fill("21");
  await page.getByLabel("PhD scholars guided").fill("2");
  await page
    .getByLabel("Statement supporting your promotion")
    .fill(
      "I have taught information security and networks for nine years, published twenty-one peer reviewed papers, and led the departmental accreditation effort across two cycles while mentoring two doctoral scholars to completion.",
    );
}

async function fillSupportingDocuments(page: Page) {
  await page.getByLabel("Curriculum vitae (PDF)").setInputFiles(FIXTURE_CV);
  await expect(page.getByTestId("file-curriculum-vitae.pdf")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByRole("checkbox", {
      name: "I declare that the information provided is true and complete.",
    })
    .check();
}

async function fillReview(page: Page, score: string, remarks: string) {
  await page.getByLabel("Overall score (out of 10)").fill(score);
  await selectOption(page, "Strength of recommendation", "Strong");
  await page.getByLabel("Remarks").fill(remarks);
}

/** Opens the applicant's form, starting the application if none exists yet. */
async function openApplication(page: Page) {
  await page.goto("/application");
  const start = page.getByTestId("start-application");
  if (await start.isVisible().catch(() => false)) {
    await start.click();
  }
  await expect(page.getByTestId("wizard-step-0")).toBeVisible();
}

test.describe("1. the applicant fills in and submits", () => {
  test.use({ storageState: storageStatePath("faculty") });

  test("cannot advance past a section with missing answers", async ({
    page,
  }) => {
    await openApplication(page);
    await page.getByTestId("wizard-next").click();

    await expect(page.getByText("Full name is required")).toBeVisible();
    await expect(page.getByText("Employee ID is required")).toBeVisible();
    await expect(page.getByTestId("wizard-step-0")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  test("keeps a saved draft across page loads", async ({ page }) => {
    await openApplication(page);
    await fillPersonalDetails(page);

    await page.getByTestId("wizard-save-draft").click();
    await expect(page.getByText("Draft saved.")).toBeVisible();

    await page.goto("/dashboard");
    await page.goto("/application");

    await expect(page.getByLabel("Full name")).toHaveValue(APPLICANT);
    await expect(page.getByLabel("Employee ID")).toHaveValue("MIT-7788");
  });

  test("completes every step, previews and submits", async ({ page }) => {
    await clearMailbox();
    await openApplication(page);

    await fillPersonalDetails(page);
    await page.getByTestId("wizard-next").click();

    await expect(page.getByLabel("Highest qualification")).toBeVisible();
    await fillAcademicRecord(page);
    await page.getByTestId("wizard-next").click();

    await expect(page.getByLabel("Curriculum vitae (PDF)")).toBeVisible();
    await fillSupportingDocuments(page);
    await page.getByTestId("wizard-next").click();

    // Nothing is sent until the applicant has seen the whole thing.
    await expect(page.getByText("Review before submitting")).toBeVisible();
    await expect(page.getByTestId("preview-section-0")).toContainText(
      APPLICANT,
    );
    await expect(page.getByTestId("preview-section-1")).toContainText(
      "Ph.D. in Information Security",
    );
    await expect(page.getByTestId("preview-section-2")).toContainText(
      "curriculum-vitae.pdf",
    );

    await page.getByTestId("submit-application").click();
    await expect(page.getByText(/Application submitted/)).toBeVisible();
    await expect(page.getByText("Currently with:")).toBeVisible();

    const mail = await waitForEmail((message) =>
      message.Subject.includes("received"),
    );
    expect(mail.To).toContain("faculty@manipal.edu");
  });
});

test.describe("2. the head of department sends it back", () => {
  test.use({ storageState: storageStatePath("hod") });

  test("returns the application for changes", async ({ page }) => {
    await clearMailbox();
    await page.goto("/reviews");

    const row = page.locator("tr", { hasText: APPLICANT }).first();
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Review" }).click();

    // The reviewer can read what the applicant submitted.
    await page.getByRole("tab", { name: "Applicant submission" }).click();
    await expect(page.getByText("Ph.D. in Information Security")).toBeVisible();

    await page.getByRole("tab", { name: "Your review" }).click();
    await fillReview(
      page,
      "7",
      "Promising record, but please attach the missing publication proofs before this goes to the Dean.",
    );
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("outcome-Send back for changes").click();

    await expect(page).toHaveURL(/\/reviews$/);
    await waitForEmail((message) => message.Subject.includes("Action needed"));
  });
});

test.describe("3. the applicant resubmits", () => {
  test.use({ storageState: storageStatePath("faculty") });

  test("sees the send-back notice with answers intact", async ({ page }) => {
    await page.goto("/application");

    await expect(
      page.getByText("This application was sent back to you"),
    ).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue(APPLICANT);

    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();

    await page.getByTestId("submit-application").click();
    await expect(page.getByText(/Application submitted/)).toBeVisible();
  });
});

test.describe("4. the head of department recommends", () => {
  test.use({ storageState: storageStatePath("hod") });

  test("advances it and notifies the Dean's role", async ({ page }) => {
    await clearMailbox();
    await page.goto("/reviews");

    await page
      .locator("tr", { hasText: APPLICANT })
      .first()
      .getByRole("link", { name: "Review" })
      .click();

    await fillReview(
      page,
      "9",
      "The revised submission is complete. Recommending strongly for promotion.",
    );
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("outcome-Recommend").click();
    await expect(page).toHaveURL(/\/reviews$/);

    // The email node addressed to a role must resolve to the Dean's inbox.
    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("dean@manipal.edu");
  });
});

test.describe("5. the dean approves", () => {
  test.use({ storageState: storageStatePath("dean") });

  test("reads the earlier review and approves", async ({ page }) => {
    await clearMailbox();
    await page.goto("/reviews");

    await page
      .locator("tr", { hasText: APPLICANT })
      .first()
      .getByRole("link", { name: "Review" })
      .click();

    // The HOD's answers live in their own namespace and are visible here.
    await page.getByRole("tab", { name: "Earlier reviews" }).click();
    await expect(
      page.getByText("Recommending strongly for promotion."),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Your review" }).click();
    await fillReview(
      page,
      "9",
      "Endorsed by the department and supported by a strong record. Approved.",
    );
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("outcome-Approve").click();
    await expect(page).toHaveURL(/\/reviews$/);

    const mail = await waitForEmail((message) =>
      message.Subject.includes("approved"),
    );
    expect(mail.To).toContain("faculty@manipal.edu");
  });

  test("no longer shows it in the queue", async ({ page }) => {
    await page.goto("/reviews");
    await expect(
      page.getByText("Nothing is waiting on you right now."),
    ).toBeVisible();
  });
});

test.describe("6. the outcome is visible to everyone entitled to it", () => {
  test.describe("to the applicant", () => {
    test.use({ storageState: storageStatePath("faculty") });

    test("shows the approved status on the dashboard", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.getByTestId("status-approved").first()).toBeVisible();
    });
  });

  test.describe("to an overseer", () => {
    test.use({ storageState: storageStatePath("registrar") });

    test("lists it and records the whole history", async ({ page }) => {
      await page.goto("/applications");

      const row = page.locator("tr", { hasText: APPLICANT }).first();
      await expect(row).toBeVisible();
      await expect(row.getByTestId("status-approved")).toBeVisible();

      await row.getByRole("link", { name: "View" }).click();
      await expect(page.getByRole("tab", { name: "Reviews" })).toBeVisible();

      await page.getByRole("tab", { name: "History" }).click();
      const timeline = page.getByTestId("application-timeline");
      for (const entry of [
        "Submitted",
        "Returned to applicant",
        "Send back for changes",
        "Recommend",
        "Approve",
        "Completed",
      ]) {
        await expect(timeline).toContainText(entry);
      }
    });
  });
});
