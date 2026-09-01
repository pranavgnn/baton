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
 * sink: submission, then HOD, HR, R&C, FD&W, the final HR declaration and the
 * Director's approval. The blocks run in declaration order and share one
 * application, so each depends on the state the previous one left behind.
 *
 * Retries are off for the same reason: re-running a failed block would start
 * from state the first attempt already changed.
 */
test.describe.configure({ mode: "serial", retries: 0 });

/** What the applicant types into the form's own "Full name" field. */
const APPLICANT = "Dr. Nikhil Prabhu";

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

async function fillPersonalDetails(page: Page) {
  const values: [string, string][] = [
    ["full_name", APPLICANT],
    ["employee_code", "MIT-7788"],
    ["date_of_birth", "1984-02-11"],
    ["present_designation", "Assistant Professor"],
    ["department", "Computer Science & Engineering"],
    ["institution", "Manipal Institute of Technology"],
    ["date_of_joining", "2017-06-01"],
    ["date_of_last_promotion", "2021-07-01"],
    ["scopus_id", "57200000001"],
  ];

  for (const [key, value] of values) {
    await input(page, key).fill(value);
  }
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
    ["total_publications", "21"],
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
 * Opens the application waiting on this role, fills its review form and takes
 * the named outcome.
 *
 * A stage form is itself a wizard, so a `fill` that spans more than one
 * section advances between them; this only makes the final step, which is what
 * reveals the outcome buttons.
 */
async function review(
  page: Page,
  {
    fill,
    outcome,
  }: {
    fill: (page: Page) => Promise<void>;
    outcome: string;
  },
) {
  await page.goto("/reviews");
  const row = applicationRow(page);
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Review" }).click();

  await page.getByRole("tab", { name: "Your review" }).click();
  await fill(page);

  await page.getByTestId("wizard-next").click();
  await page.getByTestId(`outcome-${outcome}`).click();
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
    await expect(input(page, "employee_code")).toHaveValue("MIT-7788");
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
    const stage = page.getByTestId("progress-dates-HOD Recommendation");
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

test.describe("2. the head of department recommends", () => {
  test.use({ storageState: storageStatePath("hod") });

  test("reads the submission, recommends and hands over to HR", async ({
    page,
  }) => {
    await clearMailbox();
    await page.goto("/reviews");
    await applicationRow(page).getByRole("link", { name: "Review" }).click();

    // The reviewer can read what the applicant submitted.
    await page.getByRole("tab", { name: "Applicant submission" }).click();
    await expect(page.getByText("Ph.D. in Information Security")).toBeVisible();

    await page.getByRole("tab", { name: "Your review" }).click();
    await input(page, "vacancy_remarks").fill(
      "One Associate Professor position is vacant in the department.",
    );
    await input(page, "recommendations").fill(
      "Recommended. The candidate meets the departmental expectations.",
    );

    await page.getByTestId("wizard-next").click();
    await page.getByTestId("outcome-Forward to HR").click();
    await expect(page).toHaveURL(/\/reviews$/);

    // The email addressed to a role must resolve to the HR inbox.
    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("hr@manipal.edu");
  });
});

test.describe("3. HR reviews experience and service", () => {
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

test.describe("4. R&C evaluates the research", () => {
  test.use({ storageState: storageStatePath("rc") });

  test("verifies the figures and forwards to FD&W", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      outcome: "Forward to FD&W",
      fill: async (page) => {
        // HR's answers live in their own namespace and are readable here.
        await page.getByRole("tab", { name: "Earlier reviews" }).click();
        await expect(
          page.getByText("Meets the experience criteria."),
        ).toBeVisible();
        await page.getByRole("tab", { name: "Your review" }).click();

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

test.describe("5. FD&W completes the formal evaluation", () => {
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

test.describe("6. HR declares the candidate eligible", () => {
  test.use({ storageState: storageStatePath("hr") });

  test("sees every earlier verdict before declaring", async ({ page }) => {
    await clearMailbox();
    await page.goto("/reviews");
    await applicationRow(page).getByRole("link", { name: "Review" }).click();

    await page.getByRole("tab", { name: "Earlier reviews" }).click();
    await expect(
      page.getByText("Publication record verified against Scopus."),
    ).toBeVisible();
    await expect(
      page.getByText("Formal evaluation complete. No objections."),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Your review" }).click();

    // The reason field belongs to a different decision and is not asked for.
    await expect(field(page, "ineligibility_reason")).toHaveCount(0);

    await choose(page, "final_decision", "Eligible");
    await input(page, "effective_from").fill("2026-07-01");
    await input(page, "remarks").fill(
      "Eligible on every criterion. Referred to the Director.",
    );

    await page.getByTestId("wizard-next").click();
    await page.getByTestId("outcome-Eligible").click();
    await expect(page).toHaveURL(/\/reviews$/);

    const mail = await waitForEmail((message) =>
      message.Subject.includes("awaits your review"),
    );
    expect(mail.To).toContain("director@manipal.edu");
  });
});

test.describe("7. the Director approves", () => {
  test.use({ storageState: storageStatePath("director") });

  test("approves, and the file goes to Institute HR", async ({ page }) => {
    await clearMailbox();

    await review(page, {
      outcome: "Approve",
      fill: async (page) => {
        await input(page, "remarks").fill(
          "Approved. A strong record, endorsed at every stage.",
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

test.describe("8. the outcome is visible to everyone entitled to it", () => {
  test.describe("to the applicant", () => {
    test.use({ storageState: storageStatePath("employee") });

    test("shows the approved status on the dashboard", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.getByTestId("status-approved").first()).toBeVisible();
    });

    test("dates the application on the dashboard", async ({ page }) => {
      await page.goto("/dashboard");

      const past = page.getByTestId("past-applications");
      await expect(past).toContainText("Submitted");
      await expect(past).toContainText("Decided");
      // A real date, not the placeholder for a missing one.
      await expect(past).not.toContainText("Submitted —");
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
        "Forward to HR",
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
