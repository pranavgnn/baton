import { DEFAULT_SOURCE_HANDLE } from "./types";
import type {
  FormField,
  FormSchema,
  FormSection,
  StageOutcome,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from "./types";

export const SINGLETON_WORKFLOW_ID = "primary";

/* -------------------------------------------------------------------------- */
/*  Builder helpers used by both the seed script and the admin UI              */
/* -------------------------------------------------------------------------- */

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createField(
  overrides: Partial<FormField> & Pick<FormField, "type" | "label" | "key">,
): FormField {
  return {
    id: newId("fld"),
    description: "",
    placeholder: "",
    required: false,
    options: [],
    validation: {},
    width: "full",
    ...overrides,
  };
}

export function createSection(
  title: string,
  fields: FormField[] = [],
  description = "",
): FormSection {
  return { id: newId("sec"), title, description, fields };
}

export function createOutcome(
  label: string,
  tone: StageOutcome["tone"] = "neutral",
  requiresForm = true,
): StageOutcome {
  return { id: newId("out"), label, tone, requiresForm };
}

export function emptyFormSchema(): FormSchema {
  return { sections: [] };
}

/* -------------------------------------------------------------------------- */
/*  Default template content                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: "Application Received",
    subject: "Application {{application_reference}} received",
    description: "Acknowledgement sent to the applicant on submission.",
    bodyHtml: [
      "<h2>Thank you, {{applicant_name}}</h2>",
      "<p>We have received your promotion application <strong>{{application_reference}}</strong> submitted on {{submitted_at}}.</p>",
      "<p>It is now with <strong>{{current_stage}}</strong>. You will be notified each time it moves forward.</p>",
      "<p>You can track its progress at any time from the portal.</p>",
      "<p>Regards,<br>Office of the Registrar</p>",
    ].join(""),
  },
  {
    name: "Application Advanced",
    subject: "Application {{application_reference}} moved to {{current_stage}}",
    description: "Progress notification sent when a stage is completed.",
    bodyHtml: [
      "<h2>Application update</h2>",
      "<p>Dear {{applicant_name}},</p>",
      "<p>Your application <strong>{{application_reference}}</strong> has completed <strong>{{previous_stage}}</strong> with the outcome <strong>{{last_outcome}}</strong>.</p>",
      "<p>It is now with <strong>{{current_stage}}</strong>.</p>",
      "<p>Regards,<br>Office of the Registrar</p>",
    ].join(""),
  },
  {
    name: "Application Returned",
    subject: "Action needed on application {{application_reference}}",
    description: "Sent when a reviewer sends the application back for changes.",
    bodyHtml: [
      "<h2>Your application needs changes</h2>",
      "<p>Dear {{applicant_name}},</p>",
      "<p>{{actor_name}} has returned application <strong>{{application_reference}}</strong> for revision at the <strong>{{previous_stage}}</strong> stage.</p>",
      "<p>Please sign in to the portal, update your submission and send it again.</p>",
      "<p>Regards,<br>Office of the Registrar</p>",
    ].join(""),
  },
  {
    name: "Application Approved",
    subject: "Your promotion application has been approved",
    description: "Sent when the application reaches an approved end node.",
    bodyHtml: [
      "<h2>Congratulations, {{applicant_name}}</h2>",
      "<p>Your promotion application <strong>{{application_reference}}</strong> has been <strong>approved</strong>.</p>",
      "<p>The Office of the Registrar will contact you regarding the next formalities.</p>",
      "<p>Regards,<br>Office of the Registrar</p>",
    ].join(""),
  },
  {
    name: "Application Rejected",
    subject: "Outcome of your promotion application",
    description: "Sent when the application reaches a rejected end node.",
    bodyHtml: [
      "<h2>Application outcome</h2>",
      "<p>Dear {{applicant_name}},</p>",
      "<p>After review, your promotion application <strong>{{application_reference}}</strong> has not been approved at this time.</p>",
      "<p>You may contact the Office of the Registrar for detailed feedback.</p>",
      "<p>Regards,<br>Office of the Registrar</p>",
    ].join(""),
  },
  {
    name: "Archive Notice",
    subject:
      "Approved promotion application {{application_reference}} for filing",
    description:
      "Sent to Institute HR when the Director approves, so the record can be filed.",
    bodyHtml: [
      "<h2>An approved application is ready to file</h2>",
      "<p>Application <strong>{{application_reference}}</strong> from {{applicant_name}} was approved on {{submitted_at}}.</p>",
      "<p>Open it in the portal to read the full record, including every reviewer's remarks.</p>",
      "<p>Regards,<br>Office of the Registrar</p>",
    ].join(""),
  },
  {
    name: "Reviewer Assignment",
    subject: "Application {{application_reference}} awaits your review",
    description: "Notifies the role holding the next stage.",
    bodyHtml: [
      "<h2>A promotion application needs your review</h2>",
      "<p>Application <strong>{{application_reference}}</strong> from {{applicant_name}} has reached <strong>{{current_stage}}</strong>.</p>",
      "<p>Please sign in to the portal to complete your review.</p>",
    ].join(""),
  },
] as const;

export type DefaultTemplateName =
  (typeof DEFAULT_EMAIL_TEMPLATES)[number]["name"];

/* -------------------------------------------------------------------------- */
/*  Default roles                                                              */
/* -------------------------------------------------------------------------- */

export const SUPER_ADMIN_ROLE_NAME = "Super Admin";

/**
 * Listed in priority order, lowest first. The first entry is what a user gets
 * when an import or invite names no role, so it is deliberately the least
 * privileged one.
 */
export const DEFAULT_ROLES = [
  {
    name: "Employee",
    description: "Submits and tracks their own promotion application.",
    permissions: ["applications.apply"],
    isSystem: false,
  },
  {
    name: "HOD",
    description:
      "Head of Department. Records the vacancy position and a recommendation.",
    permissions: ["applications.review"],
    isSystem: false,
  },
  {
    name: "HR Officer",
    description:
      "Reviews experience and service, and makes the final eligibility declaration.",
    permissions: ["applications.review"],
    isSystem: false,
  },
  {
    name: "R&C Officer",
    description:
      "Associate Director (R&C). Evaluates research output and publications.",
    permissions: ["applications.review"],
    isSystem: false,
  },
  {
    name: "FDW Officer",
    description:
      "Associate Director (FD&W). Carries out the formal evaluation.",
    permissions: ["applications.review"],
    isSystem: false,
  },
  {
    name: "Director",
    description: "Gives the final institutional approval or rejection.",
    permissions: ["applications.review", "applications.viewAll"],
    isSystem: false,
  },
  {
    name: "Institute HR",
    description:
      "Receives the approved application for filing. Notified by email; no action is required in the portal.",
    permissions: ["applications.viewAll"],
    isSystem: false,
  },
  {
    name: "System Admin",
    description: "Administers users, roles, the workflow and its templates.",
    permissions: [
      "admin.access",
      "users.manage",
      "roles.manage",
      "workflow.manage",
      "forms.manage",
      "templates.manage",
      "applications.viewAll",
      "audit.view",
    ],
    isSystem: false,
  },
  {
    name: SUPER_ADMIN_ROLE_NAME,
    description: "Full access to every part of the portal.",
    permissions: ["*"],
    isSystem: true,
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Applicant form - STN 023 R5, sections A to H                               */
/* -------------------------------------------------------------------------- */

/**
 * Options are written out rather than generated so the stored `value` stays
 * stable if a label is ever reworded: the value is what lands in an
 * application's answers and what an old application is read back with.
 */
function choices(...entries: [label: string, value: string][]) {
  return entries.map(([label, value]) => ({ id: newId("opt"), label, value }));
}

/**
 * A repeating table from the paper form.
 *
 * The form engine has no repeating-row field, and inventing one here would
 * mean changing the compiler, the runtime and the builder at once. Until it
 * has one, each table is a single block of text whose columns are named in the
 * helper text - which keeps every column the paper form asked for, and keeps
 * what an applicant types in one answer that a reviewer can read.
 */
function tableField(
  key: string,
  label: string,
  columns: string[],
  required = false,
) {
  return createField({
    type: "textarea",
    key,
    label,
    required,
    description: `One entry per line: ${columns.join(" | ")}`,
    placeholder: columns.join(" | "),
  });
}

export function defaultApplicantForm(): FormSchema {
  return {
    sections: [
      createSection(
        "The Post Applied For",
        [
          createField({
            type: "select",
            key: "post_applied_for",
            label: "Application for promotion to",
            required: true,
            options: choices(
              [
                "Assistant Professor Senior Scale",
                "assistant_professor_senior_scale",
              ],
              ["Associate Professor", "associate_professor"],
              ["Additional Professor", "additional_professor"],
              ["Professor", "professor"],
              ["Senior Professor", "senior_professor"],
            ),
          }),
        ],
        "The cadre you are applying to be promoted to.",
      ),

      createSection(
        "A. Personal & Employment Details",
        [
          createField({
            type: "text",
            key: "full_name",
            label: "Full name",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "employee_code",
            label: "Employee code",
            required: true,
            width: "half",
          }),
          createField({
            type: "date",
            key: "date_of_birth",
            label: "Date of birth",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "present_designation",
            label: "Present designation",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "department",
            label: "Department",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "institution",
            label: "Institution",
            required: true,
            width: "half",
          }),
          createField({
            type: "date",
            key: "date_of_joining",
            label: "Date of joining",
            required: true,
            width: "half",
          }),
          createField({
            type: "date",
            key: "date_of_last_promotion",
            label: "Date of last promotion",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "scopus_id",
            label: "Scopus ID",
            required: true,
            width: "half",
          }),
        ],
        "Your identity and current appointment, as they appear on institute records.",
      ),

      createSection(
        "B. Qualifications",
        [
          tableField(
            "qualifications",
            "Qualifications",
            ["Qualification", "College or University", "Year", "Remarks"],
            true,
          ),
        ],
        "Every qualification you hold, starting with the most recent.",
      ),

      createSection(
        "C. Previous Appointments & Teaching Experience",
        [
          tableField(
            "previous_appointments",
            "Previous appointments",
            [
              "Designation",
              "Institution",
              "From",
              "To (or Present)",
              "Total experience",
            ],
            true,
          ),
          createField({
            type: "textarea",
            key: "courses_taught",
            label: "Courses taught",
            required: true,
          }),
        ],
        "Where you have taught, and what.",
      ),

      createSection(
        "D. Research Publications",
        [
          createField({
            type: "paragraph",
            key: "publications_note",
            label:
              "These figures are verifiable on http://eprints.manipal.edu and will be checked at the R&C stage.",
          }),
          createField({
            type: "number",
            key: "total_publications",
            label: "Total publications",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "total_indexed",
            label: "Total indexed",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "total_non_indexed",
            label: "Total non-indexed",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "indexed_last_three_years",
            label: "Indexed (last 3 years)",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "non_indexed_last_three_years",
            label: "Non-indexed (last 3 years)",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "heading",
            key: "best_publications_heading",
            label: "Three best publications",
          }),
          createField({
            type: "text",
            key: "best_publication_1",
            label: "Best publication 1",
            required: true,
            placeholder: "Title of the paper",
          }),
          createField({
            type: "text",
            key: "best_publication_2",
            label: "Best publication 2",
            required: true,
            placeholder: "Title of the paper",
          }),
          createField({
            type: "text",
            key: "best_publication_3",
            label: "Best publication 3",
            required: true,
            placeholder: "Title of the paper",
          }),
        ],
        "Your publication record, and the three papers you would most like read.",
      ),

      createSection(
        "E. Research Accomplishments Checklist",
        [
          createField({
            type: "number",
            key: "min_required_scopus_fa_ca",
            label: "1. Minimum required publications in SCOPUS/WoS as FA/CA",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "total_scopus_fa_ca",
            label: "2. Total SCOPUS/WoS indexed publications as FA/CA",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "min_required_mahe_fa_ca_present_cadre",
            label:
              "3. Minimum required publications in SCOPUS/WoS with MAHE affiliation as FA/CA in present cadre",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "total_mahe_fa_ca_present_cadre",
            label:
              "4. Total SCOPUS/WoS indexed publications with MAHE affiliation as FA/CA in present cadre",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "total_multi_ca_mit_manipal",
            label:
              "5. Total SCOPUS/WoS indexed publications with more than one CA from MIT-Manipal",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "min_required_q1_q2_present_cadre",
            label:
              "6. Minimum required SCOPUS/WoS Q1/Q2 publications with MAHE affiliation as FA/CA in present cadre",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "total_q1_q2_present_cadre",
            label:
              "7. Total SCOPUS/WoS Q1/Q2 publications with MAHE affiliation as FA/CA in present cadre",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "top_500_collaborations",
            label:
              "8. Publications from collaborations with top 500 QS/THE world-ranking universities",
            description: "At most 2 are counted.",
            required: true,
            width: "half",
            validation: { min: 0, max: 2 },
          }),
          createField({
            type: "number",
            key: "sponsored_rd_amount",
            label:
              "9. Total amount received through Sponsored R&D external projects",
            description: "Leave blank if you have none. Amount in rupees.",
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "text",
            key: "sponsored_rd_role",
            label: "9a. Your role on those projects",
            description: "State PI or Co-PI. Leave blank if item 9 is blank.",
            width: "half",
          }),
          createField({
            type: "number",
            key: "utility_patents_granted",
            label: "10. Number of utility patents granted",
            description: "Leave blank if you have none.",
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "phd_guided",
            label: "11. Number of PhD scholars guided",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "phd_co_guided",
            label: "12. Number of PhD scholars co-guided",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "phd_guiding",
            label: "13. Number of PhD scholars currently guiding",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "phd_co_guiding",
            label: "14. Number of PhD scholars currently co-guiding",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "file",
            key: "scopus_sdg_page",
            label:
              "15. Scopus page showing SDG-linked and internationally co-authored publications",
            required: true,
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 1,
            },
          }),
          createField({
            type: "number",
            key: "internationally_co_authored",
            label: "16. Total internationally co-authored publications",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "sdg_linked_publications",
            label: "17. Total SDG-linked publications",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
        ],
        "The research accomplishments checklist. R&C will verify each figure.",
      ),

      createSection(
        "F. Conferences & Workshops",
        [
          tableField("conferences", "Conferences and workshops", [
            "Conference or workshop",
            "Organiser",
            "Date",
            "Duration",
          ]),
        ],
        "Optional, but worth listing.",
      ),

      createSection(
        "G. Teacher Training & Faculty Development Programmes",
        [
          tableField("faculty_development", "Programmes attended", [
            "Programme",
            "Organiser",
            "Dates",
          ]),
        ],
        "Programmes from the last three years, with their dates.",
      ),

      createSection(
        "H. Additional Contributions",
        [
          createField({
            type: "textarea",
            key: "contribution_teaching",
            label: "Contributions to teaching",
          }),
          createField({
            type: "textarea",
            key: "contribution_research",
            label: "Contributions to research",
          }),
          createField({
            type: "textarea",
            key: "contribution_institution",
            label: "Contributions to the institution",
          }),
          createField({
            type: "textarea",
            key: "contribution_university",
            label: "Contributions to the university, or any other",
          }),
        ],
        "Anything the sections above do not cover.",
      ),

      createSection(
        "Supporting Documents",
        [
          createField({
            type: "file",
            key: "scopus_profile",
            label: "Scopus profile printout",
            description:
              "With SDG-linked and internationally co-authored publications marked.",
            required: true,
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 1,
            },
          }),
          createField({
            type: "file",
            key: "best_publication_first_pages",
            label: "First page of each of your three best publications",
            required: true,
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 3,
            },
          }),
          createField({
            type: "file",
            key: "phd_guided_proof",
            label: "Proof of PhD scholars guided or co-guided",
            description:
              "Registrar evaluation announcement. Required if items 11 or 12 are above zero.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
          }),
          createField({
            type: "file",
            key: "phd_guiding_proof",
            label: "Proof of PhD scholars currently guiding or co-guiding",
            description:
              "IPAC letter. Required if items 13 or 14 are above zero.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
          }),
          createField({
            type: "file",
            key: "sponsored_rd_proof",
            label: "Sponsored R&D project proof",
            description:
              "Receipt from MAHE Finance. Required if item 9 is filled in.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
          }),
          createField({
            type: "file",
            key: "patent_certificates",
            label: "Patent certificates",
            description: "Required if item 10 is above zero.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
          }),
          createField({
            type: "file",
            key: "participation_certificates",
            label: "Participation certificates",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: [
                "application/pdf",
                ".pdf",
                "image/jpeg",
                "image/png",
              ],
              maxFiles: 10,
            },
          }),
          createField({
            type: "file",
            key: "achievement_certificates",
            label: "Achievement certificates",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: [
                "application/pdf",
                ".pdf",
                "image/jpeg",
                "image/png",
              ],
              maxFiles: 10,
            },
          }),
        ],
        "PDF, JPG or PNG, up to 10 MB each.",
      ),

      createSection("Declaration", [
        createField({
          type: "checkbox",
          key: "declaration",
          label:
            "I certify that the information provided is accurate and complete.",
          required: true,
        }),
        createField({
          type: "paragraph",
          key: "declaration_note",
          label:
            "The moment you submit is recorded as the date of this declaration.",
        }),
      ]),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Reviewer forms - Evaluation Form V2                                        */
/* -------------------------------------------------------------------------- */

const PERFORMANCE_GRADES: [string, string][] = [
  ["A+++", "a_plus_plus_plus"],
  ["A++", "a_plus_plus"],
  ["A+", "a_plus"],
  ["A", "a"],
];

const YES_NO: [string, string][] = [
  ["Yes", "yes"],
  ["No", "no"],
];

/** Section (a) and (b) of the HOD's part of the paper form. */
function hodForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Head of Department",
        [
          createField({
            type: "textarea",
            key: "vacancy_remarks",
            label: "(a) Vacancy, with remarks",
            required: true,
          }),
          createField({
            type: "textarea",
            key: "recommendations",
            label: "(b) Recommendations",
            required: true,
          }),
        ],
        "Your name, designation and the date are recorded automatically.",
      ),
    ],
  };
}

function hrInitialForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Experience & Service",
        [
          createField({
            type: "text",
            key: "experience_at_mit",
            label: "Experience at MIT",
            required: true,
            width: "half",
            placeholder: "Years and months",
          }),
          createField({
            type: "text",
            key: "experience_before_mit",
            label: "Experience from other organisations prior to MIT",
            description: "As per the eligibility criteria.",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "post_doc_duration",
            label: "Post-doctoral duration",
            description: "As per the eligibility criteria.",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "total_experience",
            label: "Total experience",
            required: true,
            width: "half",
          }),
          createField({
            type: "number",
            key: "required_experience_years",
            label: "Required experience for the applied post, in years",
            required: true,
            width: "half",
            validation: { min: 0, max: 60 },
          }),
        ],
        "Service history as HR records it.",
      ),
      createSection("Performance Grades", [
        createField({
          type: "number",
          key: "performance_year_1",
          label: "Year 1",
          required: true,
          width: "half",
          validation: { min: 1950, max: 2100 },
        }),
        createField({
          type: "select",
          key: "performance_grade_1",
          label: "Grade for year 1",
          required: true,
          width: "half",
          options: choices(...PERFORMANCE_GRADES),
        }),
        createField({
          type: "number",
          key: "performance_year_2",
          label: "Year 2",
          required: true,
          width: "half",
          validation: { min: 1950, max: 2100 },
        }),
        createField({
          type: "select",
          key: "performance_grade_2",
          label: "Grade for year 2",
          required: true,
          width: "half",
          options: choices(...PERFORMANCE_GRADES),
        }),
        createField({
          type: "number",
          key: "performance_year_3",
          label: "Year 3",
          required: true,
          width: "half",
          validation: { min: 1950, max: 2100 },
        }),
        createField({
          type: "select",
          key: "performance_grade_3",
          label: "Grade for year 3",
          required: true,
          width: "half",
          options: choices(...PERFORMANCE_GRADES),
        }),
      ]),
      createSection(
        "Verdict",
        [
          createField({
            type: "radio",
            key: "experience_eligibility",
            label: "Eligible on the experience criteria",
            required: true,
            options: choices(...YES_NO),
          }),
          createField({
            type: "date",
            key: "date_of_eligibility",
            label: "Date of eligibility",
            description: "Only if eligible.",
            width: "half",
          }),
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            required: true,
          }),
        ],
        "This verdict is carried forward. It does not close the application.",
      ),
    ],
  };
}

function rcForm(): FormSchema {
  const counts: [string, string][] = [
    [
      "min_required_scopus_fa_ca",
      "Minimum required publications in SCOPUS/WoS as FA/CA",
    ],
    ["total_scopus_fa_ca", "Total SCOPUS/WoS indexed publications as FA/CA"],
    [
      "min_required_mahe_fa_ca_present_cadre",
      "Minimum required publications in SCOPUS/WoS with MAHE affiliation as FA/CA in present cadre",
    ],
    [
      "total_mahe_fa_ca_present_cadre",
      "Total SCOPUS/WoS indexed publications with MAHE affiliation as FA/CA in present cadre",
    ],
    [
      "min_required_q1_q2_present_cadre",
      "Minimum required SCOPUS/WoS Q1/Q2 publications with MAHE affiliation as FA/CA in present cadre",
    ],
    [
      "total_q1_q2_present_cadre",
      "Total SCOPUS/WoS Q1/Q2 publications with MAHE affiliation as FA/CA in present cadre",
    ],
    [
      "top_500_collaborations",
      "Publications from collaborations with top 500 QS/THE ranking universities, as additional FA/CA",
    ],
    [
      "sponsored_rd_equivalent",
      "Publications equivalent: total Sponsored R&D external project amount",
    ],
    ["patents_equivalent", "Publications equivalent: utility patents granted"],
    ["phd_guided", "PhD scholars guided"],
    ["phd_co_guided", "PhD scholars co-guided"],
    ["phd_guiding", "PhD scholars guiding"],
    ["phd_co_guiding", "PhD scholars co-guiding"],
  ];

  return {
    sections: [
      createSection(
        "Research Accomplishments",
        counts.map(([key, label]) =>
          createField({
            type: "number",
            key,
            label,
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
        ),
        "Verified against the applicant's own figures and their Scopus profile.",
      ),
      createSection("Verdict", [
        createField({
          type: "radio",
          key: "research_eligibility",
          label: "Eligible on the research criteria",
          required: true,
          options: choices(...YES_NO),
        }),
        createField({
          type: "date",
          key: "date_of_eligibility",
          label: "Date of eligibility",
          description: "Only if eligible.",
          width: "half",
        }),
        createField({
          type: "textarea",
          key: "remarks",
          label: "Remarks by AD (R&C)",
          description: "Required if the verdict is No.",
        }),
      ]),
    ],
  };
}

function fdwForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Formal Evaluation",
        [
          createField({
            type: "radio",
            key: "eligibility_verdict",
            label: "Eligibility verdict",
            required: true,
            options: choices(
              ["Eligible", "eligible"],
              ["Not eligible", "not_eligible"],
            ),
          }),
          createField({
            type: "text",
            key: "post_eligible_for",
            label: "Post eligible for",
            description: "Only if eligible.",
            width: "half",
          }),
          createField({
            type: "date",
            key: "effective_from",
            label: "Effective from",
            description: "Only if eligible.",
            width: "half",
          }),
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            description: "Required if not eligible.",
          }),
        ],
        "The formal evaluation by AD (FD&W).",
      ),
    ],
  };
}

function hrFinalForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Final Eligibility Declaration",
        [
          createField({
            type: "paragraph",
            key: "prior_verdicts_note",
            label:
              "Read the R&C and FD&W verdicts above before declaring. Either may have recorded an ineligibility that did not stop the application.",
          }),
          createField({
            type: "date",
            key: "effective_from",
            label: "Effective from",
            description: "Only if you declare the applicant eligible.",
            width: "half",
          }),
          createField({
            type: "textarea",
            key: "ineligibility_reason",
            label: "Reason for ineligibility",
            description: "Only if you declare the applicant not eligible.",
          }),
          createField({
            type: "textarea",
            key: "other_details",
            label: "Anything the two outcomes do not cover",
          }),
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            required: true,
          }),
        ],
        "Declaring the applicant eligible sends the file to the Director. Declaring them ineligible closes it.",
      ),
    ],
  };
}

function directorForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Director's Decision",
        [
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            required: true,
          }),
        ],
        "Approving closes the application and sends it to Institute HR for filing.",
      ),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Default workflow graph                                                     */
/* -------------------------------------------------------------------------- */

export type DefaultGraphInput = {
  roleIdByName: Record<string, string>;
  templateIdByName: Record<string, string>;
};

/**
 * The promotion process as STN 023 R5 and Evaluation Form V2 describe it:
 *
 *   Submission -> HOD -> HR (initial) -> R&C -> FD&W -> HR (final)
 *                                                       |- not eligible -> closed
 *                                                       `- eligible -> Director
 *                                                                      |- approved
 *                                                                      `- rejected
 *
 * HOD, HR, R&C and FD&W each always advance: a negative verdict is recorded
 * and carried forward rather than closing the file, so the final eligibility
 * decision rests with HR and the Director alone. Every transition fans out to
 * the notifications the process calls for - to the applicant, and to whichever
 * team the file has landed on - which run alongside the step that carries the
 * application forward rather than in front of it.
 */
export function defaultWorkflowGraph({
  roleIdByName,
  templateIdByName,
}: DefaultGraphInput): WorkflowGraph {
  const outcomes = {
    hod: createOutcome("Forward to HR", "positive"),
    hrInitial: createOutcome("Forward to R&C", "positive"),
    rc: createOutcome("Forward to FD&W", "positive"),
    fdw: createOutcome("Forward to HR", "positive"),
    eligible: createOutcome("Eligible", "positive"),
    ineligible: createOutcome("Not eligible", "negative"),
    approve: createOutcome("Approve", "positive"),
    reject: createOutcome("Reject", "negative"),
  };

  const role = (name: string) => roleIdByName[name] ?? null;
  const template = (name: string) => templateIdByName[name] ?? null;

  /** An email addressed to the applicant. */
  const toApplicant = (
    id: string,
    label: string,
    templateName: string,
    position: { x: number; y: number },
  ): WorkflowNode => ({
    id,
    kind: "email",
    position,
    data: {
      label,
      description: "",
      templateId: template(templateName),
      recipientMode: "applicant",
      recipientRoleId: null,
      recipientEmail: "",
    },
  });

  /** An email addressed to whoever holds a role. */
  const toRole = (
    id: string,
    label: string,
    templateName: string,
    roleName: string,
    position: { x: number; y: number },
  ): WorkflowNode => ({
    id,
    kind: "email",
    position,
    data: {
      label,
      description: "",
      templateId: template(templateName),
      recipientMode: "role",
      recipientRoleId: role(roleName),
      recipientEmail: "",
    },
  });

  const COLUMN = 360;
  const column = (index: number) => index * COLUMN;

  const nodes: WorkflowNode[] = [
    {
      id: "node_submission",
      kind: "start",
      position: { x: column(0), y: 300 },
      data: {
        label: "Applicant Submission",
        description:
          "The promotion application form, mirroring STN 023 R5 sections A to H.",
        form: defaultApplicantForm(),
      },
    },
    toApplicant(
      "node_email_received",
      "Acknowledge Submission",
      "Application Received",
      { x: column(1), y: 520 },
    ),
    toRole(
      "node_email_hod_assigned",
      "Notify HOD",
      "Reviewer Assignment",
      "HOD",
      { x: column(1), y: 60 },
    ),

    {
      id: "node_stage_hod",
      kind: "stage",
      position: { x: column(2), y: 300 },
      data: {
        label: "HOD Recommendation",
        description:
          "Vacancy position and recommendation. The HOD always forwards to HR.",
        roleId: role("HOD"),
        form: hodForm(),
        outcomes: [outcomes.hod],
      },
    },
    toApplicant(
      "node_email_hod_done",
      "Tell Applicant: with HR",
      "Application Advanced",
      { x: column(3), y: 520 },
    ),
    toRole(
      "node_email_hr_initial_assigned",
      "Notify HR",
      "Reviewer Assignment",
      "HR Officer",
      { x: column(3), y: 60 },
    ),

    {
      id: "node_stage_hr_initial",
      kind: "stage",
      position: { x: column(4), y: 300 },
      data: {
        label: "HR Initial Review",
        description:
          "Experience and service. The verdict is carried forward, not applied.",
        roleId: role("HR Officer"),
        form: hrInitialForm(),
        outcomes: [outcomes.hrInitial],
      },
    },
    toApplicant(
      "node_email_hr_initial_done",
      "Tell Applicant: with R&C",
      "Application Advanced",
      { x: column(5), y: 520 },
    ),
    toRole(
      "node_email_rc_assigned",
      "Notify R&C",
      "Reviewer Assignment",
      "R&C Officer",
      { x: column(5), y: 60 },
    ),

    {
      id: "node_stage_rc",
      kind: "stage",
      position: { x: column(6), y: 300 },
      data: {
        label: "R&C Research Evaluation",
        description:
          "Research output and publications, verified against the applicant's figures.",
        roleId: role("R&C Officer"),
        form: rcForm(),
        outcomes: [outcomes.rc],
      },
    },
    toApplicant(
      "node_email_rc_done",
      "Tell Applicant: with FD&W",
      "Application Advanced",
      { x: column(7), y: 520 },
    ),
    toRole(
      "node_email_fdw_assigned",
      "Notify FD&W",
      "Reviewer Assignment",
      "FDW Officer",
      { x: column(7), y: 60 },
    ),

    {
      id: "node_stage_fdw",
      kind: "stage",
      position: { x: column(8), y: 300 },
      data: {
        label: "FD&W Formal Evaluation",
        description: "The formal evaluation and eligibility statement.",
        roleId: role("FDW Officer"),
        form: fdwForm(),
        outcomes: [outcomes.fdw],
      },
    },
    toApplicant(
      "node_email_fdw_done",
      "Tell Applicant: back with HR",
      "Application Advanced",
      { x: column(9), y: 520 },
    ),
    toRole(
      "node_email_hr_final_assigned",
      "Notify HR",
      "Reviewer Assignment",
      "HR Officer",
      { x: column(9), y: 60 },
    ),

    {
      id: "node_stage_hr_final",
      kind: "stage",
      position: { x: column(10), y: 300 },
      data: {
        label: "HR Final Eligibility Declaration",
        description:
          "The decision that either closes the application or sends it to the Director.",
        roleId: role("HR Officer"),
        form: hrFinalForm(),
        outcomes: [outcomes.eligible, outcomes.ineligible],
      },
    },
    toApplicant(
      "node_email_declared_ineligible",
      "Tell Applicant: not eligible",
      "Application Rejected",
      { x: column(11), y: 700 },
    ),
    {
      id: "node_end_ineligible",
      kind: "end",
      position: { x: column(11), y: 560 },
      data: {
        label: "Closed - Not Eligible",
        description: "HR declared the applicant ineligible.",
        result: "rejected",
      },
    },
    toApplicant(
      "node_email_declared_eligible",
      "Tell Applicant: with the Director",
      "Application Advanced",
      { x: column(11), y: -60 },
    ),
    toRole(
      "node_email_director_assigned",
      "Notify Director",
      "Reviewer Assignment",
      "Director",
      { x: column(11), y: 60 },
    ),

    {
      id: "node_stage_director",
      kind: "stage",
      position: { x: column(12), y: 220 },
      data: {
        label: "Director Review",
        description: "The final institutional decision.",
        roleId: role("Director"),
        form: directorForm(),
        outcomes: [outcomes.approve, outcomes.reject],
      },
    },
    toApplicant(
      "node_email_approved",
      "Tell Applicant: approved",
      "Application Approved",
      { x: column(13), y: -120 },
    ),
    toRole(
      "node_email_archive",
      "Send to Institute HR for filing",
      "Archive Notice",
      "Institute HR",
      { x: column(13), y: 0 },
    ),
    {
      id: "node_end_approved",
      kind: "end",
      position: { x: column(13), y: 140 },
      data: {
        label: "Approved",
        description: "The promotion was approved by the Director.",
        result: "approved",
      },
    },
    toApplicant(
      "node_email_rejected",
      "Tell Applicant: rejected",
      "Application Rejected",
      { x: column(13), y: 420 },
    ),
    toRole(
      "node_email_hr_fyi",
      "Tell HR (for information)",
      "Application Rejected",
      "HR Officer",
      { x: column(13), y: 540 },
    ),
    {
      id: "node_end_rejected",
      kind: "end",
      position: { x: column(13), y: 290 },
      data: {
        label: "Closed - Rejected",
        description: "The Director rejected the application.",
        result: "rejected",
      },
    },
  ];

  /** One hop plus the notifications that ride alongside it. */
  const hop = (
    source: string,
    handle: string,
    continuation: string,
    emails: string[],
  ): WorkflowEdge[] => [
    {
      id: `edge_${source}_${handle}_next`,
      source,
      sourceHandle: handle,
      target: continuation,
    },
    ...emails.map((target) => ({
      id: `edge_${source}_${handle}_${target}`,
      source,
      sourceHandle: handle,
      target,
    })),
  ];

  const OUT = DEFAULT_SOURCE_HANDLE;

  return {
    nodes,
    edges: [
      ...hop("node_submission", OUT, "node_stage_hod", [
        "node_email_received",
        "node_email_hod_assigned",
      ]),
      ...hop("node_stage_hod", outcomes.hod.id, "node_stage_hr_initial", [
        "node_email_hod_done",
        "node_email_hr_initial_assigned",
      ]),
      ...hop("node_stage_hr_initial", outcomes.hrInitial.id, "node_stage_rc", [
        "node_email_hr_initial_done",
        "node_email_rc_assigned",
      ]),
      ...hop("node_stage_rc", outcomes.rc.id, "node_stage_fdw", [
        "node_email_rc_done",
        "node_email_fdw_assigned",
      ]),
      ...hop("node_stage_fdw", outcomes.fdw.id, "node_stage_hr_final", [
        "node_email_fdw_done",
        "node_email_hr_final_assigned",
      ]),
      ...hop(
        "node_stage_hr_final",
        outcomes.eligible.id,
        "node_stage_director",
        ["node_email_declared_eligible", "node_email_director_assigned"],
      ),
      ...hop(
        "node_stage_hr_final",
        outcomes.ineligible.id,
        "node_end_ineligible",
        ["node_email_declared_ineligible"],
      ),
      ...hop("node_stage_director", outcomes.approve.id, "node_end_approved", [
        "node_email_approved",
        "node_email_archive",
      ]),
      ...hop("node_stage_director", outcomes.reject.id, "node_end_rejected", [
        "node_email_rejected",
        "node_email_hr_fyi",
      ]),
    ],
  };
}
