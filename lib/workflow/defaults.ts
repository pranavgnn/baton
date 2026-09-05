import { DEFAULT_SOURCE_HANDLE, emptyForm } from "./types";
import type {
  ConditionGroup,
  ConditionOperator,
  ConditionRule,
  FormField,
  FormSchema,
  FormSection,
  RecipientScope,
  StageAssignment,
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
    fields: [],
    prefill: null,
    formula: null,
    visibleWhen: null,
    requiredWhen: null,
    ...overrides,
  };
}

/**
 * A repeating group and the columns one entry of it carries.
 *
 * Columns are ordinary fields, so each keeps its own type and validation - a
 * year is a number, a date is a date - which is the whole point of repeating a
 * group rather than asking for a block of text.
 */
export function createRepeater(
  overrides: Partial<FormField> & Pick<FormField, "label" | "key">,
  columns: FormField[],
): FormField {
  return createField({
    type: "repeater",
    ...overrides,
    fields: columns,
  });
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

/**
 * The departments a fresh install starts with, as MIT Manipal lists them.
 *
 * A starting point rather than the whole institute: departments are administered
 * from the portal, so anything missing is added there.
 */
export const DEFAULT_DEPARTMENTS = [
  {
    name: "Department of Basic Sciences, Humanities & Management",
    code: "SBHM",
  },
  { name: "Department of Civil & Chemical Engineering", code: "SCCE" },
  { name: "Department of Computer Engineering", code: "SOCE" },
  { name: "Department of Electrical Engineering", code: "SEE" },
  { name: "Department of Mechanical Engineering", code: "SOME" },
] as const;

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
    designation: null,
  },
  {
    name: "Head",
    description:
      "Head of a department. Sends an application to one of the department's deputies and decides it once the recommendation comes back.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: "head",
  },
  {
    name: "Deputy",
    description:
      "Associate head of a department. Recommends on the applications the head sends them.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: "deputy",
  },
  {
    name: "HR Officer",
    description:
      "Reviews experience and service, and makes the final eligibility declaration.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: null,
  },
  {
    name: "R&C Officer",
    description:
      "Associate Director (R&C). Evaluates research output and publications.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: null,
  },
  {
    name: "FDW Officer",
    description:
      "Associate Director (FD&W). Carries out the formal evaluation.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: null,
  },
  {
    name: "Director",
    description:
      "Gives the final institutional approval or rejection. Nothing follows it either way.",
    permissions: ["applications.review", "applications.viewAll"],
    isSystem: false,
    designation: null,
  },
  {
    name: "Institute HR",
    description:
      "Receives the approved application for filing. Notified by email; no action is required in the portal.",
    permissions: ["applications.viewAll"],
    isSystem: false,
    designation: null,
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
    designation: null,
  },
  {
    name: SUPER_ADMIN_ROLE_NAME,
    description: "Full access to every part of the portal.",
    permissions: ["*"],
    isSystem: true,
    designation: null,
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

function rule(
  field: string,
  operator: ConditionOperator,
  value = "",
): ConditionRule {
  return { id: newId("rule"), field, operator, value };
}

/** Applies when every rule holds. */
function when(...rules: ConditionRule[]): ConditionGroup {
  return { mode: "all", rules };
}

/** Applies when any one rule holds. */
function whenAny(...rules: ConditionRule[]): ConditionGroup {
  return { mode: "any", rules };
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
            prefill: "name",
            label: "Full name",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "employee_code",
            prefill: "employeeId",
            label: "Employee code",
            required: true,
            width: "half",
          }),
          createField({
            type: "date",
            key: "date_of_birth",
            prefill: "dateOfBirth",
            label: "Date of birth",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "present_designation",
            prefill: "designation",
            label: "Present designation",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "department",
            prefill: "department",
            label: "Department",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "institution",
            prefill: "institution",
            label: "Institution",
            required: true,
            width: "half",
          }),
          createField({
            type: "date",
            key: "date_of_joining",
            prefill: "dateOfJoining",
            label: "Date of joining",
            required: true,
            width: "half",
          }),
          createField({
            type: "date",
            key: "date_of_last_promotion",
            prefill: "dateOfLastPromotion",
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
        "Taken from your account where the portal already knows it. Anything blank or wrong should be corrected by an administrator.",
      ),

      createSection(
        "B. Qualifications",
        [
          createRepeater(
            {
              key: "qualifications",
              label: "Qualifications",
              required: true,
              description: "Add one entry per qualification you hold.",
            },
            [
              createField({
                type: "text",
                key: "qualification",
                label: "Qualification",
                required: true,
                width: "half",
              }),
              createField({
                type: "text",
                key: "institution",
                label: "College or University",
                required: true,
                width: "half",
              }),
              createField({
                type: "number",
                key: "year",
                label: "Year",
                required: true,
                width: "half",
                validation: { min: 1950, max: 2100 },
              }),
              createField({
                type: "text",
                key: "remarks",
                label: "Remarks",
                width: "half",
              }),
            ],
          ),
        ],
        "Every qualification you hold, starting with the most recent.",
      ),

      createSection(
        "C. Previous Appointments & Teaching Experience",
        [
          createRepeater(
            {
              key: "previous_appointments",
              label: "Previous appointments",
              required: true,
              description: "Add one entry per appointment, most recent first.",
            },
            [
              createField({
                type: "text",
                key: "designation",
                label: "Designation",
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
                key: "from_date",
                label: "From",
                required: true,
                width: "half",
              }),
              createField({
                type: "checkbox",
                key: "is_current",
                label: "This is my current appointment",
                width: "half",
              }),
              createField({
                type: "date",
                key: "to_date",
                label: "To",
                required: true,
                width: "half",
                // The paper form allows "Present" in this column instead of a
                // date, which the tick box above says more plainly.
                visibleWhen: when(rule("is_current", "isNotChecked")),
              }),
              createField({
                type: "text",
                key: "total_experience",
                label: "Total experience",
                required: true,
                width: "half",
                placeholder: "e.g. 6 years 2 months",
              }),
            ],
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
            // Added up rather than asked for: the paper form asks for all
            // three and the totals disagree often enough to be a nuisance.
            formula: "total_indexed + total_non_indexed",
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
            description: "In rupees. Leave blank if you have none.",
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "select",
            key: "sponsored_rd_role",
            label: "9a. Your role on those projects",
            width: "half",
            options: choices(
              ["Principal Investigator", "pi"],
              ["Co-Principal Investigator", "co_pi"],
            ),
            // The paper form asks for the role only once an amount is stated.
            visibleWhen: when(rule("sponsored_rd_amount", "isFilled")),
            requiredWhen: when(rule("sponsored_rd_amount", "isFilled")),
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
          createRepeater(
            {
              key: "conferences",
              label: "Conferences and workshops",
              description: "Optional, but worth listing.",
            },
            [
              createField({
                type: "text",
                key: "name",
                label: "Conference or workshop",
                required: true,
                width: "half",
              }),
              createField({
                type: "text",
                key: "organiser",
                label: "Organiser",
                required: true,
                width: "half",
              }),
              createField({
                type: "date",
                key: "date",
                label: "Date",
                required: true,
                width: "half",
              }),
              createField({
                type: "text",
                key: "duration",
                label: "Duration",
                width: "half",
                placeholder: "e.g. 3 days",
              }),
            ],
          ),
        ],
        "Conferences and workshops you have taken part in.",
      ),

      createSection(
        "G. Teacher Training & Faculty Development Programmes",
        [
          createRepeater(
            {
              key: "faculty_development",
              label: "Programmes attended",
              description: "Programmes from the last three years.",
            },
            [
              createField({
                type: "text",
                key: "programme",
                label: "Programme",
                required: true,
                width: "half",
              }),
              createField({
                type: "text",
                key: "organiser",
                label: "Organiser",
                required: true,
                width: "half",
              }),
              createField({
                type: "date",
                key: "from_date",
                label: "From",
                required: true,
                width: "half",
              }),
              createField({
                type: "date",
                key: "to_date",
                label: "To",
                required: true,
                width: "half",
              }),
            ],
          ),
        ],
        "Teacher training and faculty development from the last three years.",
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
            description: "Registrar evaluation announcement.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
            // Asked for exactly when items 11 or 12 say there are any.
            visibleWhen: whenAny(
              rule("phd_guided", "greaterThan", "0"),
              rule("phd_co_guided", "greaterThan", "0"),
            ),
            requiredWhen: whenAny(
              rule("phd_guided", "greaterThan", "0"),
              rule("phd_co_guided", "greaterThan", "0"),
            ),
          }),
          createField({
            type: "file",
            key: "phd_guiding_proof",
            label: "Proof of PhD scholars currently guiding or co-guiding",
            description: "IPAC letter.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
            visibleWhen: whenAny(
              rule("phd_guiding", "greaterThan", "0"),
              rule("phd_co_guiding", "greaterThan", "0"),
            ),
            requiredWhen: whenAny(
              rule("phd_guiding", "greaterThan", "0"),
              rule("phd_co_guiding", "greaterThan", "0"),
            ),
          }),
          createField({
            type: "file",
            key: "sponsored_rd_proof",
            label: "Sponsored R&D project proof",
            description: "Receipt from MAHE Finance.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
            visibleWhen: when(rule("sponsored_rd_amount", "isFilled")),
            requiredWhen: when(rule("sponsored_rd_amount", "isFilled")),
          }),
          createField({
            type: "file",
            key: "patent_certificates",
            label: "Patent certificates",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 5,
            },
            visibleWhen: when(
              rule("utility_patents_granted", "greaterThan", "0"),
            ),
            requiredWhen: when(
              rule("utility_patents_granted", "greaterThan", "0"),
            ),
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
        "PDF, JPG or PNG, up to 10 MB each. Some are asked for only when your answers call for them.",
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

/** What the deputy the head named records before it goes back. */
function deputyForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Deputy",
        [
          createField({
            type: "radio",
            key: "recommendation",
            label: "Recommendation",
            required: true,
            options: choices(
              ["Recommended", "recommended"],
              ["Not recommended", "not_recommended"],
            ),
          }),
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            required: true,
          }),
        ],
        "Read the applicant's submission before recording your recommendation. It goes back to the head, who decides.",
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
      createSection(
        "Performance Grades",
        [
          createRepeater(
            {
              key: "performance_grades",
              label: "Performance grades",
              required: true,
              description: "The last three years, one entry each.",
              validation: { minRows: 3, maxRows: 3 },
            },
            [
              createField({
                type: "number",
                key: "year",
                label: "Year",
                required: true,
                width: "half",
                validation: { min: 1950, max: 2100 },
              }),
              createField({
                type: "select",
                key: "grade",
                label: "Grade",
                required: true,
                width: "half",
                options: choices(...PERFORMANCE_GRADES),
              }),
            ],
          ),
        ],
        "Three years of performance grades, as the paper form records them.",
      ),
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
            required: true,
            width: "half",
            visibleWhen: when(rule("experience_eligibility", "equals", "yes")),
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
          required: true,
          width: "half",
          visibleWhen: when(rule("research_eligibility", "equals", "yes")),
        }),
        createField({
          type: "textarea",
          key: "remarks",
          label: "Remarks by AD (R&C)",
          description: "Required when the verdict is No.",
          requiredWhen: when(rule("research_eligibility", "equals", "no")),
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
            required: true,
            width: "half",
            visibleWhen: when(
              rule("eligibility_verdict", "equals", "eligible"),
            ),
          }),
          createField({
            type: "date",
            key: "effective_from",
            label: "Effective from",
            required: true,
            width: "half",
            visibleWhen: when(
              rule("eligibility_verdict", "equals", "eligible"),
            ),
          }),
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            description: "Required when the candidate is not eligible.",
            requiredWhen: when(
              rule("eligibility_verdict", "equals", "not_eligible"),
            ),
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
            type: "select",
            key: "final_decision",
            label: "Final decision",
            required: true,
            width: "half",
            options: choices(
              ["Eligible", "eligible"],
              ["Not eligible", "not_eligible"],
              ["Other", "other"],
            ),
          }),
          createField({
            type: "date",
            key: "effective_from",
            label: "Effective from",
            required: true,
            width: "half",
            visibleWhen: when(rule("final_decision", "equals", "eligible")),
          }),
          createField({
            type: "textarea",
            key: "ineligibility_reason",
            label: "Reason for ineligibility",
            required: true,
            visibleWhen: when(rule("final_decision", "equals", "not_eligible")),
          }),
          createField({
            type: "textarea",
            key: "other_details",
            label: "Please specify",
            required: true,
            visibleWhen: when(rule("final_decision", "equals", "other")),
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

/** What the head records when the recommendation comes back to them. */
function headApprovalForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Head",
        [
          createField({
            type: "textarea",
            key: "vacancy_remarks",
            label: "(a) Vacancy, with remarks",
            required: true,
          }),
          createField({
            type: "textarea",
            key: "remarks",
            label: "(b) Remarks",
            required: true,
          }),
        ],
        "Read the deputy's recommendation before deciding. Approving sends the application on to HR; rejecting closes it.",
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
 *   Submission -> Head (delegates) -> Deputy -> Head (decides)
 *                                                       |- rejected -> closed
 *                                                       `- approved -> HR
 *                                       HR -> R&C -> FD&W -> HR (final)
 *                                                       |- not eligible -> closed
 *                                                       `- eligible -> Director
 *                                                                      |- approved
 *                                                                      `- rejected
 *
 * The department half of that is three steps rather than one. The head does not
 * write anything up front: they name the deputy who should look at it,
 * that person records a recommendation, and it comes back to the head to
 * approve or reject. Both head steps are scoped to the applicant's own department,
 * so a head is never shown another department's file, and the deputy step
 * is held for the one person the head named.
 *
 * Everything from HR onwards always advances: a negative verdict is recorded
 * and carried forward rather than closing the file, so the final eligibility
 * decision rests with HR and the Director alone, and the Director's word is the
 * last one. Every transition fans out to the notifications the process calls
 * for - to the applicant, and to whichever team the file has landed on - which
 * run alongside the step that carries the application forward rather than in
 * front of it.
 */
export function defaultWorkflowGraph({
  roleIdByName,
  templateIdByName,
}: DefaultGraphInput): WorkflowGraph {
  const outcomes = {
    delegate: createOutcome("Send to deputy", "positive"),
    recommend: createOutcome("Return to the head", "positive"),
    headApprove: createOutcome("Approve", "positive"),
    headReject: createOutcome("Reject", "negative"),
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
      recipientScope: "all_holders",
      recipientEmail: "",
    },
  });

  /**
   * An email addressed to whoever holds a role, optionally narrowed: to the
   * holders attached to the applicant's own department, or to the one person the
   * application has just been handed to.
   */
  const toRole = (
    id: string,
    label: string,
    templateName: string,
    roleName: string,
    position: { x: number; y: number },
    scope: RecipientScope = "all_holders",
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
      recipientScope: scope,
      recipientEmail: "",
    },
  });

  /** Offered to everyone holding the role, wherever they sit. */
  const anyHolder: StageAssignment = {
    mode: "role",
    pool: "role_holders",
    scope: "all_holders",
  };

  /** Offered only to the holders attached to the applicant's own department. */
  const departmentHolder: StageAssignment = {
    mode: "role",
    pool: "role_holders",
    scope: "applicant_department",
  };

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
      "node_email_head_assigned",
      "Notify Head",
      "Reviewer Assignment",
      "Head",
      { x: column(1), y: 60 },
      "applicant_department",
    ),

    {
      id: "node_stage_head",
      kind: "stage",
      position: { x: column(2), y: 300 },
      data: {
        label: "Head Delegation",
        description:
          "The head of the applicant's department names the deputy who should look at this. Nothing is written up at this point - the head has the last word once the recommendation comes back.",
        roleId: role("Head"),
        form: emptyForm(),
        outcomes: [outcomes.delegate],
        assignment: departmentHolder,
      },
    },
    toApplicant(
      "node_email_head_done",
      "Tell Applicant: with the deputy",
      "Application Advanced",
      { x: column(3), y: 520 },
    ),
    toRole(
      "node_email_deputy_assigned",
      "Notify Deputy",
      "Reviewer Assignment",
      "Deputy",
      { x: column(3), y: 60 },
      // Only the person the head named: the rest of the department's associate
      // heads are not being asked for anything.
      "assigned_person",
    ),

    {
      id: "node_stage_deputy",
      kind: "stage",
      position: { x: column(4), y: 300 },
      data: {
        label: "Deputy Recommendation",
        description:
          "The deputy the head named records a recommendation and their remarks, and sends it back to the head.",
        roleId: role("Deputy"),
        form: deputyForm(),
        outcomes: [outcomes.recommend],
        // Not offered to the deputies at large: the head names one of
        // their own department's, and the file is held for that person alone.
        assignment: {
          mode: "nominated",
          pool: "department_deputies",
          scope: "all_holders",
        },
      },
    },
    toApplicant(
      "node_email_deputy_done",
      "Tell Applicant: back with the head",
      "Application Advanced",
      { x: column(5), y: 520 },
    ),
    toRole(
      "node_email_head_approval_assigned",
      "Notify Head: recommendation received",
      "Reviewer Assignment",
      "Head",
      { x: column(5), y: 60 },
      "applicant_department",
    ),

    {
      id: "node_stage_head_approval",
      kind: "stage",
      position: { x: column(6), y: 300 },
      data: {
        label: "Head Approval",
        description:
          "The head reads the recommendation and either approves the application, sending it on to HR, or rejects it and closes the file.",
        roleId: role("Head"),
        form: headApprovalForm(),
        outcomes: [outcomes.headApprove, outcomes.headReject],
        assignment: departmentHolder,
      },
    },
    toApplicant(
      "node_email_head_approved",
      "Tell Applicant: with HR",
      "Application Advanced",
      { x: column(7), y: 520 },
    ),
    toRole(
      "node_email_hr_initial_assigned",
      "Notify HR",
      "Reviewer Assignment",
      "HR Officer",
      { x: column(7), y: 60 },
    ),
    toApplicant(
      "node_email_head_rejected",
      "Tell Applicant: rejected by the head",
      "Application Rejected",
      { x: column(7), y: 840 },
    ),
    {
      id: "node_end_head_rejected",
      kind: "end",
      position: { x: column(7), y: 700 },
      data: {
        label: "Closed - Rejected by the Head",
        description:
          "The head rejected the application after reading the deputy's recommendation.",
        result: "rejected",
      },
    },

    {
      id: "node_stage_hr_initial",
      kind: "stage",
      position: { x: column(8), y: 300 },
      data: {
        label: "HR Initial Review",
        description:
          "Experience and service. The verdict is carried forward, not applied.",
        roleId: role("HR Officer"),
        form: hrInitialForm(),
        outcomes: [outcomes.hrInitial],
        assignment: anyHolder,
      },
    },
    toApplicant(
      "node_email_hr_initial_done",
      "Tell Applicant: with R&C",
      "Application Advanced",
      { x: column(9), y: 520 },
    ),
    toRole(
      "node_email_rc_assigned",
      "Notify R&C",
      "Reviewer Assignment",
      "R&C Officer",
      { x: column(9), y: 60 },
    ),

    {
      id: "node_stage_rc",
      kind: "stage",
      position: { x: column(10), y: 300 },
      data: {
        label: "R&C Research Evaluation",
        description:
          "Research output and publications, verified against the applicant's figures.",
        roleId: role("R&C Officer"),
        form: rcForm(),
        outcomes: [outcomes.rc],
        assignment: anyHolder,
      },
    },
    toApplicant(
      "node_email_rc_done",
      "Tell Applicant: with FD&W",
      "Application Advanced",
      { x: column(11), y: 520 },
    ),
    toRole(
      "node_email_fdw_assigned",
      "Notify FD&W",
      "Reviewer Assignment",
      "FDW Officer",
      { x: column(11), y: 60 },
    ),

    {
      id: "node_stage_fdw",
      kind: "stage",
      position: { x: column(12), y: 300 },
      data: {
        label: "FD&W Formal Evaluation",
        description: "The formal evaluation and eligibility statement.",
        roleId: role("FDW Officer"),
        form: fdwForm(),
        outcomes: [outcomes.fdw],
        assignment: anyHolder,
      },
    },
    toApplicant(
      "node_email_fdw_done",
      "Tell Applicant: back with HR",
      "Application Advanced",
      { x: column(13), y: 520 },
    ),
    toRole(
      "node_email_hr_final_assigned",
      "Notify HR",
      "Reviewer Assignment",
      "HR Officer",
      { x: column(13), y: 60 },
    ),

    {
      id: "node_stage_hr_final",
      kind: "stage",
      position: { x: column(14), y: 300 },
      data: {
        label: "HR Final Eligibility Declaration",
        description:
          "The decision that either closes the application or sends it to the Director.",
        roleId: role("HR Officer"),
        form: hrFinalForm(),
        outcomes: [outcomes.eligible, outcomes.ineligible],
        assignment: anyHolder,
      },
    },
    toApplicant(
      "node_email_declared_ineligible",
      "Tell Applicant: not eligible",
      "Application Rejected",
      { x: column(15), y: 700 },
    ),
    {
      id: "node_end_ineligible",
      kind: "end",
      position: { x: column(15), y: 560 },
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
      { x: column(15), y: -60 },
    ),
    toRole(
      "node_email_director_assigned",
      "Notify Director",
      "Reviewer Assignment",
      "Director",
      { x: column(15), y: 60 },
    ),

    {
      id: "node_stage_director",
      kind: "stage",
      position: { x: column(16), y: 220 },
      data: {
        label: "Director Review",
        description:
          "The final institutional decision. Nothing follows it either way.",
        roleId: role("Director"),
        form: directorForm(),
        outcomes: [outcomes.approve, outcomes.reject],
        assignment: anyHolder,
      },
    },
    toApplicant(
      "node_email_approved",
      "Tell Applicant: approved",
      "Application Approved",
      { x: column(17), y: -120 },
    ),
    toRole(
      "node_email_archive",
      "Send to Institute HR for filing",
      "Archive Notice",
      "Institute HR",
      { x: column(17), y: 0 },
    ),
    {
      id: "node_end_approved",
      kind: "end",
      position: { x: column(17), y: 140 },
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
      { x: column(17), y: 420 },
    ),
    toRole(
      "node_email_hr_fyi",
      "Tell HR (for information)",
      "Application Rejected",
      "HR Officer",
      { x: column(17), y: 540 },
    ),
    {
      id: "node_end_rejected",
      kind: "end",
      position: { x: column(17), y: 290 },
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
      ...hop("node_submission", OUT, "node_stage_head", [
        "node_email_received",
        "node_email_head_assigned",
      ]),
      ...hop("node_stage_head", outcomes.delegate.id, "node_stage_deputy", [
        "node_email_head_done",
        "node_email_deputy_assigned",
      ]),
      ...hop(
        "node_stage_deputy",
        outcomes.recommend.id,
        "node_stage_head_approval",
        ["node_email_deputy_done", "node_email_head_approval_assigned"],
      ),
      ...hop(
        "node_stage_head_approval",
        outcomes.headApprove.id,
        "node_stage_hr_initial",
        ["node_email_head_approved", "node_email_hr_initial_assigned"],
      ),
      ...hop(
        "node_stage_head_approval",
        outcomes.headReject.id,
        "node_end_head_rejected",
        ["node_email_head_rejected", "node_email_hr_fyi"],
      ),
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
