import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  clearMailbox,
  expectToast,
  storageStatePath,
  waitForEmail,
} from "./helpers";

const FIXTURE_PDF = path.join(__dirname, "fixtures", "curriculum-vitae.pdf");

/**
 * Drives the whole example process against a real database, object store and
 * SMTP sink: submission, a department review that sends it back and then names
 * an assessor, the assessment, the department's decision, a compliance check
 * and the final approval.
 *
 * The blocks run in declaration order and share one application, so each
 * depends on the state the previous one left behind. Retries are off for the
 * same reason: re-running a failed block would start from state the first
 * attempt already changed.
 */
test.describe.configure({ mode: "serial", retries: 0 });

/** The name on the form, which is never typed: it comes from the account. */
const APPLICANT = "Test Applicant";
const APPLICANT_EMAIL = "applicant@example.org";

/**
 * Queues and listings identify an application by its account holder rather
 * than by anything typed into the form, so rows are found by that address.
 */
const applicationRow = (page: Page) =>
  page.locator("tr").filter({ hasText: APPLICANT_EMAIL }).first();

/* -------------------------------------------------------------------------- */
/*  Filling the applicant's form                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fields are addressed by their data key rather than their label: a required
 * field's accessible name carries the asterisk beside it, and two labels on
 * one step can share a prefix, so neither a loose nor an exact label lookup is
 * reliable. The key is.
 */
function field(page: Page, key: string) {
  return page.getByTestId(`field-${key}`);
}

function input(page: Page, key: string) {
  return field(page, key).locator("input, textarea").first();
}

/** Picks from a shadcn select, which renders a combobox rather than a native one. */
async function choose(page: Page, key: string, optionLabel: string) {
  await field(page, key).getByRole("combobox").click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

/** Uploads the fixture into one file field and waits for it to land. */
async function attach(page: Page, key: string) {
  const target = field(page, key);
  await target.locator('input[type="file"]').setInputFiles(FIXTURE_PDF);
  await expect(target.getByTestId("file-curriculum-vitae.pdf")).toBeVisible({
    timeout: 30_000,
  });
}

async function fillRequest(page: Page) {
  await choose(page, "request_type", "Training");
  await input(page, "effective_from").fill("2026-10-01");
  await input(page, "title").fill("Advanced incident response course");
  await input(page, "justification").fill(
    "The team has no certified responder and we carry the out-of-hours rota.",
  );
}

/**
 * Almost nothing is asked here: the account already holds the particulars, so
 * they arrive filled in and locked. Only what the portal cannot know is typed.
 */
async function fillAboutYou(page: Page) {
  await expect(input(page, "full_name")).toHaveValue(APPLICANT);
  await expect(input(page, "full_name")).toHaveAttribute("readonly", "");
  await expect(input(page, "department_name")).toHaveValue("Engineering");
  await expect(input(page, "joined_on")).toHaveValue("2019-06-01");

  // The one particular the account does hold and the form still lets them
  // correct, because it was typed rather than locked.
  await expect(input(page, "contact_number")).toHaveValue("+1 555 0100");
}

async function fillCosts(page: Page) {
  await input(page, "cost_direct").fill("1200");
  await input(page, "cost_indirect").fill("300");
  // Added up rather than asked for.
  await expect(input(page, "cost_total")).toHaveValue("1500");

  await field(page, "needs_funding").getByRole("checkbox").click();
  await input(page, "funding_source").fill("Training budget, cost centre 4021");
}

async function fillHistory(page: Page) {
  await page.getByTestId("earlier_requests-add").click();
  await input(page, "earlier_requests.0.reference").fill("APP-2025-0042");
  await input(page, "earlier_requests.0.year").fill("2025");
  await choose(page, "earlier_requests.0.outcome", "Withdrawn");
  await input(page, "earlier_requests.0.remarks").fill("Withdrawn on cost.");
}

async function completeForm(page: Page) {
  await fillRequest(page);
  await page.getByTestId("wizard-next").click();

  await fillAboutYou(page);
  await page.getByTestId("wizard-next").click();

  await fillCosts(page);
  await page.getByTestId("wizard-next").click();

  await fillHistory(page);
  await page.getByTestId("wizard-next").click();

  await attach(page, "supporting_document");
  await page.getByTestId("wizard-next").click();

  await field(page, "declaration").getByRole("checkbox").click();
  await page.getByTestId("wizard-next").click();
}

async function openApplication(page: Page) {
  await page.goto("/application");
  const start = page.getByTestId("start-application");
  if (await start.isVisible().catch(() => false)) {
    await start.click();
  }
  await expect(page.getByTestId("wizard-step-0")).toBeVisible();
}

/* -------------------------------------------------------------------------- */
/*  Reviewing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Opens the application waiting on this role, reads it, fills its form and
 * takes the named outcome.
 *
 * The page opens on the file - the submission and every completed review - so
 * `read` runs there, and `fill` runs after the decision has been opened. Every
 * outcome is confirmed.
 */
async function review(
  page: Page,
  {
    read,
    fill,
    outcome,
  }: {
    read?: (page: Page) => Promise<void>;
    fill?: (page: Page) => Promise<void>;
    outcome: string;
  },
) {
  await page.goto("/reviews");
  const row = applicationRow(page);
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Review", exact: true }).click();

  if (read) await read(page);

  await page.getByTestId("open-decision").click();
  if (fill) {
    await fill(page);
    await page.getByTestId("wizard-next").click();
  }

  await page.getByTestId(`outcome-${outcome}`).click();
  await page.getByTestId(`confirm-${outcome}`).click();
  await expect(page).toHaveURL(/\/reviews$/);
}

/* -------------------------------------------------------------------------- */
/*  1. Submission                                                              */
/* -------------------------------------------------------------------------- */

test.describe("1. the applicant fills in and submits", () => {
  test.use({ storageState: storageStatePath("applicant") });

  test("cannot advance past a step with missing answers", async ({ page }) => {
    await openApplication(page);
    await page.getByTestId("wizard-next").click();

    await expect(page.getByText("Type of request is required")).toBeVisible();
    await expect(page.getByTestId("wizard-step-0")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  test("asks for a detail only when the answer calls for it", async ({
    page,
  }) => {
    await openApplication(page);
    await expect(field(page, "other_type_detail")).toHaveCount(0);

    await choose(page, "request_type", "Something else");
    await expect(field(page, "other_type_detail")).toBeVisible();

    await choose(page, "request_type", "Training");
    await expect(field(page, "other_type_detail")).toHaveCount(0);
  });

  test("keeps a saved draft across page loads", async ({ page }) => {
    await openApplication(page);
    await fillRequest(page);

    await page.getByTestId("wizard-save-draft").click();
    await expectToast(page, "Draft saved.");

    await page.goto("/dashboard");
    await page.goto("/application");

    await expect(input(page, "title")).toHaveValue(
      "Advanced incident response course",
    );
  });

  test("completes every step, previews and submits", async ({ page }) => {
    await clearMailbox();
    await openApplication(page);
    await completeForm(page);

    // Nothing is sent until the applicant has seen the whole thing.
    await expect(page.getByText("Review before submitting")).toBeVisible();
    await expect(page.getByTestId("preview-section-1")).toContainText(
      APPLICANT,
    );
    await expect(page.getByTestId("preview-section-2")).toContainText("1500");
    await expect(page.getByTestId("preview-section-4")).toContainText(
      "curriculum-vitae.pdf",
    );

    await page.getByTestId("submit-application").click();
    await expectToast(page, /Application submitted/);

    // The tracking page draws the whole process, marking where it sits now.
    await expect(page.getByTestId("application-progress")).toBeVisible();
    await expect(page.getByTestId("progress-current").first()).toBeVisible();

    const submission = page.getByTestId("progress-dates-Application");
    await expect(submission).toContainText("Arrived");
    await expect(submission).toContainText("Moved on");

    const stage = page.getByTestId("progress-dates-Department Review");
    await expect(stage).toContainText("Arrived");
    await expect(stage).not.toContainText("Moved on");

    const mail = await waitForEmail((message) =>
      message.Subject.includes("received"),
    );
    expect(mail.To).toContain(APPLICANT_EMAIL);
  });
});

/* -------------------------------------------------------------------------- */
/*  2. The department review, which sends it back before it sends it on        */
/* -------------------------------------------------------------------------- */

test.describe("2. the head returns it for changes", () => {
  test.use({ storageState: storageStatePath("head") });

  test("sends it back to its author without filling anything in", async ({
    page,
  }) => {
    await clearMailbox();

    await review(page, {
      read: async (page) => {
        // The head reads what was submitted before deciding what to do.
        await expect(
          page.getByText("Advanced incident response course"),
        ).toBeVisible();
      },
      outcome: "Return for changes",
    });

    const mail = await waitForEmail((message) =>
      message.Subject.includes("Changes needed"),
    );
    expect(mail.To).toContain(APPLICANT_EMAIL);
  });
});

test.describe("3. the applicant sends it again", () => {
  test.use({ storageState: storageStatePath("applicant") });

  test("says it came back, and keeps every answer", async ({ page }) => {
    await page.goto("/application");
    await expect(
      page.getByText("This application was sent back to you"),
    ).toBeVisible();

    // Nothing was lost on the way back.
    await expect(input(page, "title")).toHaveValue(
      "Advanced incident response course",
    );

    // Every answer is still there, so each step passes as it is walked
    // through - waiting for the move, since a step change is a render.
    for (let step = 0; step < 5; step++) {
      await page.getByTestId("wizard-next").click();
      await expect(page.getByTestId(`wizard-step-${step + 1}`)).toHaveAttribute(
        "aria-current",
        "step",
      );
    }
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("submit-application").click();
    await expectToast(page, /Application submitted/);
  });
});

test.describe("4. the head names who assesses it", () => {
  test.use({ storageState: storageStatePath("head") });

  test("cannot send it on without naming somebody", async ({ page }) => {
    await page.goto("/reviews");
    await applicationRow(page)
      .getByRole("link", { name: "Review", exact: true })
      .click();
    await page.getByTestId("open-decision").click();

    // The head writes nothing here, so the outcome waits on a name and on
    // nothing else.
    await expect(
      page.getByTestId("nominee-field-Send for assessment"),
    ).toBeVisible();
    await expect(
      page.getByTestId("outcome-Send for assessment"),
    ).toBeDisabled();
  });

  test("sends it to the deputy it names", async ({ page }) => {
    await clearMailbox();
    await page.goto("/reviews");
    await applicationRow(page)
      .getByRole("link", { name: "Review", exact: true })
      .click();
    await page.getByTestId("open-decision").click();

    // Only this department's deputies are on offer.
    await page.getByTestId("nominee-Send for assessment").click();
    await expect(
      page.getByRole("option", { name: "Test Deputy Two" }),
    ).toBeVisible();
    await page
      .getByRole("option", { name: "Test Deputy", exact: true })
      .click();

    await page.getByTestId("outcome-Send for assessment").click();
    await page.getByTestId("confirm-Send for assessment").click();
    await expect(page).toHaveURL(/\/reviews$/);

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    // Addressed to the one person it was handed to, not to every deputy of
    // the department.
    expect(mail.To).toEqual(["deputy@example.org"]);
  });
});

test.describe("5. only the named deputy sees it", () => {
  test.describe("the one who was not chosen", () => {
    test.use({ storageState: storageStatePath("deputy2") });

    test("does not see it in their queue", async ({ page }) => {
      await page.goto("/reviews");
      await expect(
        page.getByText("Nothing is waiting on you right now."),
      ).toBeVisible();
    });
  });

  test.describe("the one who was", () => {
    test.use({ storageState: storageStatePath("deputy") });

    test("assesses it and sends it back to the head", async ({ page }) => {
      await clearMailbox();

      await review(page, {
        read: async (page) => {
          await expect(
            page.getByText("The team has no certified responder"),
          ).toBeVisible();
        },
        fill: async (page) => {
          await page
            .getByRole("radio", { name: "Recommended", exact: true })
            .check();
          await input(page, "remarks").fill(
            "Assessed on the head's referral. The rota case is sound.",
          );
        },
        outcome: "Return to the head",
      });

      const mail = await waitForEmail((message) =>
        message.Subject.includes("awaits your review"),
      );
      expect(mail.To).toContain("head@example.org");
    });
  });
});

test.describe("6. the head decides on the assessment", () => {
  test.use({ storageState: storageStatePath("head") });

  test("approves it, and it goes on to Compliance", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      read: async (page) => {
        // The assessment is what the head is deciding on.
        await expect(
          page.getByText("Assessed on the head's referral."),
        ).toBeVisible();
      },
      fill: async (page) => {
        await input(page, "remarks").fill(
          "Approved. The department can carry the cost this year.",
        );
      },
      outcome: "Approve",
    });

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("compliance@example.org");
  });
});

test.describe("7. compliance checks it against the rules", () => {
  test.use({ storageState: storageStatePath("compliance") });

  test("attaches conditions and forwards it", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      fill: async (page) => {
        // The conditions field is not asked for until the verdict calls for it.
        await expect(field(page, "conditions")).toHaveCount(0);
        await page
          .getByRole("radio", { name: "Yes, with the conditions below" })
          .check();

        await input(page, "conditions").fill(
          "Booking must go through the central travel desk.",
        );
        await input(page, "remarks").fill(
          "Within policy on every other count.",
        );
      },
      outcome: "Forward for approval",
    });

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("approver@example.org");
  });
});

test.describe("8. the approver has the last word", () => {
  test.use({ storageState: storageStatePath("approver") });

  test("approves, and the record goes to Records", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      read: async (page) => {
        // Every earlier verdict is in front of them when they decide.
        await expect(
          page.getByText("Within policy on every other count."),
        ).toBeVisible();
      },
      fill: async (page) => {
        await input(page, "remarks").fill(
          "Approved. Cost and case are both reasonable.",
        );
      },
      outcome: "Approve",
    });

    const approval = await waitForEmail((message) =>
      message.Subject.includes("approved"),
    );
    expect(approval.To).toContain(APPLICANT_EMAIL);

    const filing = await waitForEmail((message) =>
      message.Subject.includes("for filing"),
    );
    expect(filing.To).toContain("records@example.org");
  });

  test("no longer shows it in the queue", async ({ page }) => {
    await page.goto("/reviews");
    await expect(
      page.getByText("Nothing is waiting on you right now."),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  9. The outcome                                                             */
/* -------------------------------------------------------------------------- */

test.describe("9. the outcome is visible to everyone entitled to it", () => {
  test.describe("to the applicant", () => {
    test.use({ storageState: storageStatePath("applicant") });

    test("shows the approved status, dated, on the dashboard", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await expect(page.getByTestId("status-approved").first()).toBeVisible();

      const past = page.getByTestId("past-applications");
      await expect(past).toContainText("Submitted");
      await expect(past).toContainText("Decided");
      // Real dates, not the placeholder for a missing one.
      await expect(past).not.toContainText("Submitted —");
    });

    test("downloads the whole file as a PDF", async ({ page }) => {
      await page.goto("/dashboard");
      await page
        .getByTestId("past-applications")
        .getByRole("link", { name: "View" })
        .first()
        .click();

      const download = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("export-pdf").click(),
      ]).then(([event]) => event);

      expect(download.suggestedFilename()).toMatch(/^APP-.*\.pdf$/);

      const file = await download.path();
      const bytes = await readFile(file);
      // A real document: the header, and enough of it to hold the form, every
      // review and the enclosed upload.
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.byteLength).toBeGreaterThan(8_000);
    });
  });

  test.describe("to a reviewer who signed it off", () => {
    test.use({ storageState: storageStatePath("head") });

    test("keeps every decision they took, after the queue has emptied", async ({
      page,
    }) => {
      await page.goto("/reviews");
      await expect(
        page.getByText("Nothing is waiting on you right now."),
      ).toBeVisible();

      // The head acted three times on this application: sending it back,
      // naming an assessor, and deciding it.
      await page.getByTestId("open-review-history").click();

      const rows = page.getByRole("row");
      await expect(rows.filter({ hasText: "Department Review" })).toHaveCount(
        2,
      );
      await expect(rows.filter({ hasText: "Department Decision" })).toHaveCount(
        1,
      );
      await expect(page.getByTestId("pagination")).toContainText("3 reviews");

      // And from there back into the application itself.
      await rows
        .filter({ hasText: "Department Decision" })
        .getByRole("link", { name: "View" })
        .click();
      await expect(
        page.getByText("Approved. The department can carry"),
      ).toBeVisible();
    });

    test("shows them on the dashboard too", async ({ page }) => {
      await page.goto("/dashboard");
      const reviewed = page.getByTestId("reviewed-by-you");
      await expect(reviewed).toContainText("Department Decision: Approve");
      await expect(reviewed).toContainText(APPLICANT);
    });
  });

  test.describe("to an administrator", () => {
    test.use({ storageState: storageStatePath("superAdmin") });

    test("shows on the applicant's own record", async ({ page }) => {
      await page.goto("/admin/users");
      await page
        .getByRole("textbox", { name: "Search users" })
        .fill(APPLICANT_EMAIL);
      // The record opens in its own tab, so the listing stays where it was.
      const recordPromise = page.context().waitForEvent("page");
      await page.getByTestId(`open-user-${APPLICANT_EMAIL}`).click();
      const record = await recordPromise;

      const applications = record.getByTestId("user-applications");
      await expect(applications).toContainText("APP-");
      await expect(applications).toContainText("Decided");
      await record.close();
    });
  });

  test.describe("to an overseer", () => {
    test.use({ storageState: storageStatePath("approver") });

    test("lists it and records the whole history", async ({ page }) => {
      await page.goto("/applications");

      const row = applicationRow(page);
      await expect(row).toBeVisible();
      await expect(row.getByTestId("status-approved")).toBeVisible();

      await row.getByRole("link", { name: "View" }).click();
      await expect(page.getByRole("tab", { name: "Reviews" })).toBeVisible();

      await page.getByRole("tab", { name: "History" }).click();
      const timeline = page.getByTestId("application-timeline");
      for (const entry of [
        "Submitted",
        "Return for changes",
        "Send for assessment",
        "Return to the head",
        "Forward for approval",
        "Approve",
        "Completed",
      ]) {
        await expect(timeline).toContainText(entry);
      }
      // Email is not a step in an application's history.
      await expect(timeline).not.toContainText("Email");
    });
  });
});
