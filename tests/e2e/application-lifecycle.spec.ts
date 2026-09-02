import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  clearMailbox,
  expectToast,
  storageStatePath,
  waitForEmail,
} from "./helpers";

const FIXTURE_CV = path.join(__dirname, "fixtures", "curriculum-vitae.pdf");

/**
 * Drives the whole promotion process against a real database, MinIO and SMTP
 * sink: submission, then the dean and the associate dean they choose, HR,
 * R&C, FD&W, the final HR declaration and the
 * Director's approval. The blocks run in declaration order and share one
 * application, so each depends on the state the previous one left behind.
 *
 * Retries are off for the same reason: re-running a failed block would start
 * from state the first attempt already changed.
 */
test.describe.configure({ mode: "serial", retries: 0 });

/**
 * The name on the form, which is no longer typed at all: section A is filled
 * in from the applicant's own account.
 */
const APPLICANT = "Test Employee";

/**
 * Queues and listings identify an application by its account holder, not by
 * whatever was typed into the form, so rows are found by the account's email.
 */
const APPLICANT_EMAIL = "employee@manipal.edu";
const applicationRow = (page: Page) =>
  page.locator("tr").filter({ hasText: APPLICANT_EMAIL }).first();

/* -------------------------------------------------------------------------- */
/*  Filling the applicant's form                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fields are addressed by their data key, not their label.
 *
 * Several labels on the same step are prefixes of one another - "Total
 * indexed" and "Total indexed publications as FA/CA", "Indexed (last 3 years)"
 * and "Non-indexed (last 3 years)" - and a required field's accessible name
 * carries the asterisk beside it, so neither a loose nor an exact label lookup
 * is reliable here. The key is.
 */
function field(page: Page, key: string) {
  return page.getByTestId(`field-${key}`);
}

function input(page: Page, key: string) {
  return field(page, key).locator("input, textarea").first();
}

/** Uploads the fixture into one file field and waits for it to land. */
async function attach(page: Page, key: string) {
  const target = field(page, key);
  await target.locator('input[type="file"]').setInputFiles(FIXTURE_CV);
  await expect(target.getByTestId("file-curriculum-vitae.pdf")).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Fills one entry of a repeating group, adding it first if it is not there.
 *
 * Columns are addressed by the group's own path, so `qualifications.1.year`
 * reaches the second entry - the same path validation reports against.
 */
async function fillEntry(
  page: Page,
  group: string,
  index: number,
  values: Record<string, string>,
) {
  const rows = page.getByTestId(new RegExp(`^${group}-row-`));
  while ((await rows.count()) <= index) {
    await page.getByTestId(`${group}-add`).click();
  }

  for (const [column, value] of Object.entries(values)) {
    await input(page, `${group}.${index}.${column}`).fill(value);
  }
}

/** Picks from a shadcn select, which renders a combobox rather than a native one. */
async function choose(page: Page, key: string, optionLabel: string) {
  await field(page, key).getByRole("combobox").click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

async function fillPostApplied(page: Page) {
  await choose(page, "post_applied_for", "Associate Professor");
}

/**
 * Section A asks almost nothing: the account already holds the particulars, so
 * they arrive filled in and locked. Only what the portal cannot know is typed.
 */
async function fillPersonalDetails(page: Page) {
  await expect(input(page, "full_name")).toHaveValue(APPLICANT);
  await expect(input(page, "full_name")).toHaveAttribute("readonly", "");
  await expect(input(page, "date_of_joining")).toHaveValue("2017-06-01");
  await expect(input(page, "department")).toHaveValue(
    "School of Computer Engineering",
  );

  await input(page, "scopus_id").fill("57200000001");
}

async function fillQualifications(page: Page) {
  await fillEntry(page, "qualifications", 0, {
    qualification: "Ph.D. in Information Security",
    institution: "Manipal Academy of Higher Education",
    year: "2016",
    remarks: "Awarded with distinction",
  });
  await fillEntry(page, "qualifications", 1, {
    qualification: "M.Tech. in Computer Science",
    institution: "NIT Karnataka",
    year: "2010",
  });
}

async function fillAppointments(page: Page) {
  // The current appointment has no end date, which the tick box says instead.
  await fillEntry(page, "previous_appointments", 0, {
    designation: "Assistant Professor",
    institution: "Manipal Institute of Technology",
    from_date: "2017-06-01",
    total_experience: "9 years",
  });
  await field(page, "previous_appointments.0.is_current")
    .getByRole("checkbox")
    .check();

  await fillEntry(page, "previous_appointments", 1, {
    designation: "Lecturer",
    institution: "NMAM Institute of Technology",
    from_date: "2011-07-01",
    to_date: "2017-05-31",
    total_experience: "6 years",
  });

  await input(page, "courses_taught").fill(
    "Information Security, Computer Networks, Applied Cryptography, Operating Systems.",
  );
}

async function fillPublications(page: Page) {
  const values: [string, string][] = [
    ["total_indexed", "17"],
    ["total_non_indexed", "4"],
    ["indexed_last_three_years", "8"],
    ["non_indexed_last_three_years", "1"],
    ["best_publication_1", "A lattice-based scheme for federated key exchange"],
    [
      "best_publication_2",
      "Side-channel resilience in constrained IoT devices",
    ],
    ["best_publication_3", "Privacy-preserving telemetry for campus networks"],
  ];

  for (const [key, value] of values) {
    await input(page, key).fill(value);
  }
}

/** Every item of the research accomplishments checklist the form insists on. */
async function fillChecklist(page: Page) {
  const values: [string, string][] = [
    ["min_required_scopus_fa_ca", "6"],
    ["total_scopus_fa_ca", "11"],
    ["min_required_mahe_fa_ca_present_cadre", "4"],
    ["total_mahe_fa_ca_present_cadre", "9"],
    ["total_multi_ca_mit_manipal", "3"],
    ["min_required_q1_q2_present_cadre", "2"],
    ["total_q1_q2_present_cadre", "5"],
    ["top_500_collaborations", "2"],
    ["phd_guided", "2"],
    ["phd_co_guided", "1"],
    ["phd_guiding", "3"],
    ["phd_co_guiding", "2"],
    ["internationally_co_authored", "6"],
    ["sdg_linked_publications", "4"],
  ];

  for (const [key, value] of values) {
    await input(page, key).fill(value);
  }

  await attach(page, "scopus_sdg_page");
}

async function fillDocuments(page: Page) {
  await attach(page, "scopus_profile");
  await attach(page, "best_publication_first_pages");

  // Items 11-14 are all above zero, so both proofs are now asked for.
  await attach(page, "phd_guided_proof");
  await attach(page, "phd_guiding_proof");
}

async function acceptDeclaration(page: Page) {
  await field(page, "declaration").getByRole("checkbox").check();
}

/** Everything the form insists on, section by section, without advancing. */
const SECTION_FILLERS: ((page: Page) => Promise<void>)[] = [
  fillPostApplied,
  fillPersonalDetails,
  fillQualifications,
  fillAppointments,
  fillPublications,
  fillChecklist,
  async () => {}, // F. Conferences - optional
  async () => {}, // G. Faculty development - optional
  async () => {}, // H. Additional contributions - optional
  fillDocuments,
  acceptDeclaration,
];

/**
 * Walks the wizard to the preview, filling each section on the way.
 *
 * Every click waits for the step to actually become current first: advancing
 * runs validation and a draft save, so firing the clicks back to back races on
 * a fast machine.
 */
async function completeForm(page: Page, fill = true) {
  for (const [index, filler] of SECTION_FILLERS.entries()) {
    await expect(page.getByTestId(`wizard-step-${index}`)).toHaveAttribute(
      "aria-current",
      "step",
    );
    if (fill) await filler(page);
    await page.getByTestId("wizard-next").click();
  }
  await expect(page.getByTestId("submit-application")).toBeVisible();
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

/* -------------------------------------------------------------------------- */
/*  Reviewing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Opens the application waiting on this role, reads it, fills its review form
 * and takes the named outcome.
 *
 * The page opens on the file - the submission and every completed review - so
 * `read` runs there, and `fill` runs after the decision has been opened. A
 * stage form is itself a wizard, so a `fill` that spans more than one section
 * advances between them; this only makes the final step, which is what reveals
 * the outcome buttons. Every outcome is then confirmed.
 */
async function review(
  page: Page,
  {
    read,
    fill,
    outcome,
  }: {
    read?: (page: Page) => Promise<void>;
    fill: (page: Page) => Promise<void>;
    outcome: string;
  },
) {
  await page.goto("/reviews");
  const row = applicationRow(page);
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Review" }).click();

  if (read) await read(page);

  await page.getByTestId("open-decision").click();
  await fill(page);

  await page.getByTestId("wizard-next").click();
  await page.getByTestId(`outcome-${outcome}`).click();
  await page.getByTestId(`confirm-${outcome}`).click();
  await expect(page).toHaveURL(/\/reviews$/);
}

/* -------------------------------------------------------------------------- */
/*  1. Submission                                                              */
/* -------------------------------------------------------------------------- */

test.describe("1. the applicant fills in and submits", () => {
  test.use({ storageState: storageStatePath("employee") });

  test("cannot advance past a section with missing answers", async ({
    page,
  }) => {
    await openApplication(page);
    // Section 0 asks the one question the whole form hangs off.
    await page.getByTestId("wizard-next").click();

    await expect(
      page.getByText("Application for promotion to is required"),
    ).toBeVisible();
    await expect(page.getByTestId("wizard-step-0")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  test("keeps a saved draft across page loads", async ({ page }) => {
    await openApplication(page);
    await fillPostApplied(page);
    await page.getByTestId("wizard-next").click();
    await fillPersonalDetails(page);

    await page.getByTestId("wizard-save-draft").click();
    await expectToast(page, "Draft saved.");

    await page.goto("/dashboard");
    await page.goto("/application");

    // The wizard reopens at the first step, and later steps stay locked until
    // the ones before them are complete - so walk forward rather than jumping.
    await page.getByTestId("wizard-next").click();
    await expect(input(page, "full_name")).toHaveValue(APPLICANT);
    await expect(input(page, "scopus_id")).toHaveValue("57200000001");
  });

  test("completes every section, previews and submits", async ({ page }) => {
    await clearMailbox();
    await openApplication(page);
    await completeForm(page);

    // Nothing is sent until the applicant has seen the whole thing.
    await expect(page.getByText("Review before submitting")).toBeVisible();
    await expect(page.getByTestId("preview-section-1")).toContainText(
      APPLICANT,
    );
    await expect(page.getByTestId("preview-section-2")).toContainText(
      "Ph.D. in Information Security",
    );
    await expect(page.getByTestId("preview-section-9")).toContainText(
      "curriculum-vitae.pdf",
    );

    await page.getByTestId("submit-application").click();
    await expectToast(page, /Application submitted/);

    // The tracking page draws the whole process, marking where it now sits.
    await expect(page.getByTestId("application-progress")).toBeVisible();
    await expect(page.getByTestId("progress-current").first()).toBeVisible();

    // Each step it has reached says when, so the wait is legible.
    const submission = page.getByTestId("progress-dates-Applicant Submission");
    await expect(submission).toContainText("Arrived");
    await expect(submission).toContainText("Moved on");

    // The step it is sitting on has arrived but not moved on.
    const stage = page.getByTestId("progress-dates-Dean Recommendation");
    await expect(stage).toContainText("Arrived");
    await expect(stage).not.toContainText("Moved on");

    const mail = await waitForEmail((message) =>
      message.Subject.includes("received"),
    );
    expect(mail.To).toContain(APPLICANT_EMAIL);
  });
});

/* -------------------------------------------------------------------------- */
/*  2 - 5. The review chain                                                    */
/* -------------------------------------------------------------------------- */

test.describe("2. the dean delegates to an associate dean", () => {
  test.use({ storageState: storageStatePath("dean") });

  test("cannot send it on without naming who reviews it next", async ({
    page,
  }) => {
    await page.goto("/reviews");
    await applicationRow(page).getByRole("link", { name: "Review" }).click();

    // The page opens on the file itself rather than on a form.
    await expect(page.getByText("Ph.D. in Information Security")).toBeVisible();

    // The dean writes nothing at this point - they only decide who looks at
    // it - so the outcome waits on a name and on nothing else.
    await page.getByTestId("open-decision").click();
    await expect(
      page.getByTestId("nominee-field-Send to associate dean"),
    ).toBeVisible();
    await expect(
      page.getByTestId("outcome-Send to associate dean"),
    ).toBeDisabled();
  });

  test("sends it to the associate dean it names", async ({ page }) => {
    await clearMailbox();
    await page.goto("/reviews");
    await applicationRow(page).getByRole("link", { name: "Review" }).click();
    await page.getByTestId("open-decision").click();

    // Only this school's associate deans are on offer.
    await page.getByTestId("nominee-Send to associate dean").click();
    await expect(
      page.getByRole("option", { name: "Test Associate Dean Two" }),
    ).toBeVisible();
    await page
      .getByRole("option", { name: "Test Associate Dean", exact: true })
      .click();

    await page.getByTestId("outcome-Send to associate dean").click();
    await page.getByTestId("confirm-Send to associate dean").click();
    await expect(page).toHaveURL(/\/reviews$/);

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    // Addressed to the one person it was handed to, and not to every
    // associate dean of the school.
    expect(mail.To).toEqual(["associatedean@manipal.edu"]);
  });
});

test.describe("3. only the named associate dean sees it", () => {
  test.describe("the one who was not chosen", () => {
    test.use({ storageState: storageStatePath("associateDean2") });

    test("does not see it in their queue", async ({ page }) => {
      await page.goto("/reviews");
      await expect(
        page.getByText("Nothing is waiting on you right now."),
      ).toBeVisible();
    });
  });

  test.describe("the one who was", () => {
    test.use({ storageState: storageStatePath("associateDean") });

    test("recommends it and sends it back to the dean", async ({ page }) => {
      await clearMailbox();

      await review(page, {
        outcome: "Return to the dean",
        read: async (page) => {
          // What the applicant said travels with it.
          await expect(
            page.getByText("Ph.D. in Information Security"),
          ).toBeVisible();
        },
        fill: async (page) => {
          await page
            .getByRole("radio", { name: "Recommended", exact: true })
            .check();
          await input(page, "remarks").fill(
            "Reviewed on the dean's referral. No objections.",
          );
        },
      });

      const mail = await waitForEmail((message) =>
        message.Subject.includes("awaits your review"),
      );
      expect(mail.To).toContain("dean@manipal.edu");
    });
  });
});

test.describe("3b. the dean decides on the recommendation", () => {
  test.use({ storageState: storageStatePath("dean") });

  test("approves it, and it goes on to HR", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      outcome: "Approve",
      read: async (page) => {
        // The associate dean's recommendation is what the dean decides on.
        await expect(
          page.getByText("Reviewed on the dean's referral."),
        ).toBeVisible();
      },
      fill: async (page) => {
        await input(page, "vacancy_remarks").fill(
          "One Associate Professor position is vacant in the school.",
        );
        await input(page, "remarks").fill(
          "Approved. The candidate meets the school's expectations.",
        );
      },
    });

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("hr@manipal.edu");
  });
});

test.describe("4. HR reviews experience and service", () => {
  test.use({ storageState: storageStatePath("hr") });

  test("records the service history and forwards to R&C", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      outcome: "Forward to R&C",
      fill: async (page) => {
        await input(page, "experience_at_mit").fill("9 years 3 months");
        await input(page, "experience_before_mit").fill("6 years");
        await input(page, "post_doc_duration").fill("None");
        await input(page, "total_experience").fill("15 years 3 months");
        await input(page, "required_experience_years").fill("8");

        await page.getByTestId("wizard-next").click();

        const grades: [string, string][] = [
          ["2023", "A++"],
          ["2024", "A+++"],
          ["2025", "A++"],
        ];
        for (const [index, [year, grade]] of grades.entries()) {
          await fillEntry(page, "performance_grades", index, { year });
          await choose(page, `performance_grades.${index}.grade`, grade);
        }

        await page.getByTestId("wizard-next").click();

        await page.getByRole("radio", { name: "Yes" }).check();
        await input(page, "date_of_eligibility").fill("2026-07-01");
        await input(page, "remarks").fill(
          "Service record verified. Meets the experience criteria.",
        );
      },
    });

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("rc@manipal.edu");
  });
});

test.describe("5. R&C evaluates the research", () => {
  test.use({ storageState: storageStatePath("rc") });

  test("verifies the figures and forwards to FD&W", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      outcome: "Forward to FD&W",
      read: async (page) => {
        // HR's answers live in their own namespace and are readable here.
        await expect(
          page.getByText("Meets the experience criteria."),
        ).toBeVisible();
      },
      fill: async (page) => {
        // Every count R&C is asked to verify, addressed by key for the same
        // reason as the applicant's form.
        for (const key of [
          "min_required_scopus_fa_ca",
          "total_scopus_fa_ca",
          "min_required_mahe_fa_ca_present_cadre",
          "total_mahe_fa_ca_present_cadre",
          "min_required_q1_q2_present_cadre",
          "total_q1_q2_present_cadre",
          "top_500_collaborations",
          "sponsored_rd_equivalent",
          "patents_equivalent",
          "phd_guided",
          "phd_co_guided",
          "phd_guiding",
          "phd_co_guiding",
        ]) {
          await input(page, key).fill("2");
        }

        await page.getByTestId("wizard-next").click();

        // Saying Yes is what asks for the date of eligibility at all.
        await page.getByRole("radio", { name: "Yes" }).check();
        await input(page, "date_of_eligibility").fill("2026-07-01");
        await input(page, "remarks").fill(
          "Publication record verified against Scopus. Criteria met.",
        );
      },
    });

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("fdw@manipal.edu");
  });
});

test.describe("6. FD&W completes the formal evaluation", () => {
  test.use({ storageState: storageStatePath("fdw") });

  test("declares the candidate eligible and sends it back to HR", async ({
    page,
  }) => {
    await clearMailbox();

    await review(page, {
      outcome: "Forward to HR",
      fill: async (page) => {
        await page
          .getByRole("radio", { name: "Eligible", exact: true })
          .check();
        await input(page, "post_eligible_for").fill("Associate Professor");
        await input(page, "effective_from").fill("2026-07-01");
        await input(page, "remarks").fill(
          "Formal evaluation complete. No objections.",
        );
      },
    });

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("hr@manipal.edu");
  });
});

test.describe("7. HR declares the candidate eligible", () => {
  test.use({ storageState: storageStatePath("hr") });

  test("sees every earlier verdict before declaring", async ({ page }) => {
    await clearMailbox();
    await page.goto("/reviews");
    await applicationRow(page).getByRole("link", { name: "Review" }).click();

    await expect(
      page.getByText("Publication record verified against Scopus."),
    ).toBeVisible();
    await expect(
      page.getByText("Formal evaluation complete. No objections."),
    ).toBeVisible();

    await page.getByTestId("open-decision").click();

    // The reason field belongs to a different decision and is not asked for.
    await expect(field(page, "ineligibility_reason")).toHaveCount(0);

    await choose(page, "final_decision", "Eligible");
    await input(page, "effective_from").fill("2026-07-01");
    await input(page, "remarks").fill(
      "Eligible on every criterion. Referred to the Director.",
    );

    await page.getByTestId("wizard-next").click();
    await page.getByTestId("outcome-Eligible").click();
    await page.getByTestId("confirm-Eligible").click();
    await expect(page).toHaveURL(/\/reviews$/);

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("director@manipal.edu");
  });
});

test.describe("8. the Director has the last word", () => {
  test.use({ storageState: storageStatePath("director") });

  test("approves, and the file goes to Institute HR", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      outcome: "Approve",
      read: async (page) => {
        // Every earlier verdict is in front of them when they decide.
        await expect(
          page.getByText("Eligible on every criterion."),
        ).toBeVisible();
      },
      fill: async (page) => {
        await input(page, "remarks").fill(
          "Endorsed at every stage. Approved - a strong record.",
        );
      },
    });

    const approval = await waitForEmail((message) =>
      message.Subject.includes("approved"),
    );
    expect(approval.To).toContain(APPLICANT_EMAIL);

    const archive = await waitForEmail((message) =>
      message.Subject.includes("for filing"),
    );
    expect(archive.To).toContain("institutehr@manipal.edu");
  });

  test("no longer shows it in the queue", async ({ page }) => {
    await page.goto("/reviews");
    await expect(
      page.getByText("Nothing is waiting on you right now."),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  8. The outcome                                                             */
/* -------------------------------------------------------------------------- */

test.describe("9. the outcome is visible to everyone entitled to it", () => {
  test.describe("to the applicant", () => {
    test.use({ storageState: storageStatePath("employee") });

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
      // The applicant reaches their own file from the dashboard; the listing
      // of everybody's is for overseers.
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

      expect(download.suggestedFilename()).toMatch(/^PROM-.*\.pdf$/);

      const file = await download.path();
      const bytes = await readFile(file);
      // A real document: the header, and enough of it to hold the form, every
      // review and the enclosed CV.
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.byteLength).toBeGreaterThan(20_000);
    });
  });

  test.describe("to a reviewer who signed it off", () => {
    test.use({ storageState: storageStatePath("dean") });

    test("keeps every decision they took, after the queue has emptied", async ({
      page,
    }) => {
      await page.goto("/reviews");
      await expect(
        page.getByText("Nothing is waiting on you right now."),
      ).toBeVisible();

      // The dean acted twice on this application: once to delegate it and
      // once to decide it, so both are theirs to look back at.
      await page.getByTestId("open-review-history").click();

      const rows = page.getByRole("row");
      await expect(rows.filter({ hasText: "Dean Delegation" })).toHaveCount(1);
      await expect(rows.filter({ hasText: "Dean Approval" })).toHaveCount(1);
      await expect(page.getByTestId("pagination")).toContainText("2 reviews");

      // And from there back into the application itself.
      await rows
        .filter({ hasText: "Dean Approval" })
        .getByRole("link", { name: "View" })
        .click();
      await expect(
        page.getByText("Approved. The candidate meets"),
      ).toBeVisible();
    });

    test("shows them on the dashboard too", async ({ page }) => {
      await page.goto("/dashboard");
      const reviewed = page.getByTestId("reviewed-by-you");
      await expect(reviewed).toContainText("Dean Approval: Approve");
      await expect(reviewed).toContainText(APPLICANT);
    });
  });

  test.describe("to an overseer", () => {
    test.use({ storageState: storageStatePath("director") });

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
        "Send to associate dean",
        "Return to the dean",
        "Forward to R&C",
        "Forward to FD&W",
        "Eligible",
        "Approve",
        "Completed",
      ]) {
        await expect(timeline).toContainText(entry);
      }
    });
  });
});
