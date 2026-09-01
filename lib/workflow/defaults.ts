import type {
  FormField,
  FormSchema,
  FormSection,
  StageOutcome,
  WorkflowGraph,
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

export const DEFAULT_ROLES = [
  {
    name: SUPER_ADMIN_ROLE_NAME,
    description: "Full access to every part of the portal.",
    permissions: ["*"],
    isSystem: true,
  },
  {
    name: "Faculty",
    description: "Can submit and track their own promotion application.",
    permissions: ["applications.apply"],
    isSystem: false,
  },
  {
    name: "Head of Department",
    description: "Reviews applications from their department.",
    permissions: ["applications.review"],
    isSystem: false,
  },
  {
    name: "Dean",
    description: "Final academic authority on promotion applications.",
    permissions: ["applications.review", "applications.viewAll"],
    isSystem: false,
  },
  {
    name: "Registrar",
    description: "Administers the portal configuration and user access.",
    permissions: [
      "admin.access",
      "users.manage",
      "workflow.manage",
      "templates.manage",
      "applications.viewAll",
    ],
    isSystem: false,
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Default applicant form                                                     */
/* -------------------------------------------------------------------------- */

export function defaultApplicantForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Personal Details",
        [
          createField({
            type: "text",
            key: "full_name",
            label: "Full name",
            required: true,
            width: "half",
            placeholder: "As it appears on institute records",
          }),
          createField({
            type: "text",
            key: "employee_id",
            label: "Employee ID",
            required: true,
            width: "half",
            validation: {
              pattern: "^[A-Za-z0-9-]{3,20}$",
              patternMessage: "Use 3-20 letters, digits or hyphens",
            },
          }),
          createField({
            type: "email",
            key: "email",
            label: "Institute email",
            required: true,
            width: "half",
          }),
          createField({
            type: "phone",
            key: "phone",
            label: "Contact number",
            required: true,
            width: "half",
          }),
          createField({
            type: "select",
            key: "department",
            label: "Department",
            required: true,
            width: "half",
            options: [
              {
                id: newId("opt"),
                label: "Computer Science & Engineering",
                value: "cse",
              },
              {
                id: newId("opt"),
                label: "Electronics & Communication",
                value: "ece",
              },
              {
                id: newId("opt"),
                label: "Mechanical Engineering",
                value: "mech",
              },
              { id: newId("opt"), label: "Civil Engineering", value: "civil" },
              {
                id: newId("opt"),
                label: "Information Technology",
                value: "it",
              },
            ],
          }),
          createField({
            type: "select",
            key: "current_designation",
            label: "Current designation",
            required: true,
            width: "half",
            options: [
              {
                id: newId("opt"),
                label: "Assistant Professor",
                value: "assistant_professor",
              },
              {
                id: newId("opt"),
                label: "Senior Assistant Professor",
                value: "senior_assistant_professor",
              },
              {
                id: newId("opt"),
                label: "Associate Professor",
                value: "associate_professor",
              },
            ],
          }),
          createField({
            type: "date",
            key: "date_of_joining",
            label: "Date of joining",
            required: true,
            width: "half",
          }),
          createField({
            type: "select",
            key: "applied_designation",
            label: "Designation applied for",
            required: true,
            width: "half",
            options: [
              {
                id: newId("opt"),
                label: "Senior Assistant Professor",
                value: "senior_assistant_professor",
              },
              {
                id: newId("opt"),
                label: "Associate Professor",
                value: "associate_professor",
              },
              { id: newId("opt"), label: "Professor", value: "professor" },
            ],
          }),
        ],
        "Confirm your identity and the position you are applying for.",
      ),
      createSection(
        "Academic Record",
        [
          createField({
            type: "heading",
            key: "academic_heading",
            label: "Qualifications and output",
          }),
          createField({
            type: "text",
            key: "highest_qualification",
            label: "Highest qualification",
            required: true,
            width: "half",
          }),
          createField({
            type: "number",
            key: "years_of_experience",
            label: "Years of teaching experience",
            required: true,
            width: "half",
            validation: { min: 0, max: 60 },
          }),
          createField({
            type: "number",
            key: "publications_count",
            label: "Peer-reviewed publications",
            required: true,
            width: "half",
            validation: { min: 0, max: 1000 },
          }),
          createField({
            type: "number",
            key: "phd_scholars_guided",
            label: "PhD scholars guided",
            width: "half",
            validation: { min: 0, max: 100 },
          }),
          createField({
            type: "multiselect",
            key: "contributions",
            label: "Institutional contributions",
            description: "Select every area you have contributed to.",
            options: [
              {
                id: newId("opt"),
                label: "Curriculum development",
                value: "curriculum",
              },
              {
                id: newId("opt"),
                label: "Accreditation work",
                value: "accreditation",
              },
              {
                id: newId("opt"),
                label: "Student mentoring",
                value: "mentoring",
              },
              {
                id: newId("opt"),
                label: "Sponsored research",
                value: "research",
              },
              {
                id: newId("opt"),
                label: "Industry consultancy",
                value: "consultancy",
              },
            ],
          }),
          createField({
            type: "textarea",
            key: "statement_of_purpose",
            label: "Statement supporting your promotion",
            required: true,
            validation: { minLength: 100, maxLength: 4000 },
            description: "Between 100 and 4000 characters.",
          }),
        ],
        "Your qualifications, research output and contributions.",
      ),
      createSection(
        "Supporting Documents",
        [
          createField({
            type: "file",
            key: "curriculum_vitae",
            label: "Curriculum vitae (PDF)",
            required: true,
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf"],
              maxFiles: 1,
            },
          }),
          createField({
            type: "file",
            key: "publication_proofs",
            label: "Publication proofs",
            description: "Up to five files, 10 MB each.",
            validation: {
              maxFileSizeMb: 10,
              acceptedFileTypes: ["application/pdf", ".pdf", "image/*"],
              maxFiles: 5,
            },
          }),
          createField({
            type: "checkbox",
            key: "declaration",
            label:
              "I declare that the information provided is true and complete.",
            required: true,
          }),
        ],
        "Attach the evidence supporting your application.",
      ),
    ],
  };
}

function reviewForm(roleLabel: string): FormSchema {
  return {
    sections: [
      createSection(`${roleLabel} assessment`, [
        createField({
          type: "number",
          key: "score",
          label: "Overall score (out of 10)",
          required: true,
          width: "half",
          validation: { min: 0, max: 10 },
        }),
        createField({
          type: "select",
          key: "recommendation_strength",
          label: "Strength of recommendation",
          required: true,
          width: "half",
          options: [
            { id: newId("opt"), label: "Strong", value: "strong" },
            { id: newId("opt"), label: "Moderate", value: "moderate" },
            { id: newId("opt"), label: "Weak", value: "weak" },
          ],
        }),
        createField({
          type: "textarea",
          key: "remarks",
          label: "Remarks",
          required: true,
          validation: { minLength: 20, maxLength: 2000 },
        }),
      ]),
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
 * Ships a complete, publishable workflow so a fresh install is immediately
 * usable: submission -> acknowledgement -> HOD -> Dean -> outcome, with a
 * send-back loop from the HOD stage to the applicant.
 */
export function defaultWorkflowGraph({
  roleIdByName,
  templateIdByName,
}: DefaultGraphInput): WorkflowGraph {
  const hodOutcomes = {
    recommend: createOutcome("Recommend", "positive"),
    sendBack: createOutcome("Send back for changes", "neutral"),
    reject: createOutcome("Do not recommend", "negative"),
  };
  const deanOutcomes = {
    approve: createOutcome("Approve", "positive"),
    reject: createOutcome("Reject", "negative"),
  };

  const ids = {
    start: "node_submission",
    ackEmail: "node_email_ack",
    hod: "node_stage_hod",
    returnEmail: "node_email_returned",
    deanEmail: "node_email_dean",
    dean: "node_stage_dean",
    approvedEmail: "node_email_approved",
    rejectedEmail: "node_email_rejected",
    approvedEnd: "node_end_approved",
    rejectedEnd: "node_end_rejected",
  };

  return {
    nodes: [
      {
        id: ids.start,
        kind: "start",
        position: { x: 0, y: 200 },
        data: {
          label: "Applicant Submission",
          description:
            "The promotion application form filled by the faculty member.",
          form: defaultApplicantForm(),
        },
      },
      {
        id: ids.ackEmail,
        kind: "email",
        position: { x: 340, y: 380 },
        data: {
          label: "Acknowledge Submission",
          description: "Confirms receipt to the applicant.",
          templateId: templateIdByName["Application Received"] ?? null,
          recipientMode: "applicant",
          recipientRoleId: null,
          recipientEmail: "",
        },
      },
      {
        id: ids.hod,
        kind: "stage",
        position: { x: 680, y: 200 },
        data: {
          label: "Head of Department Review",
          description: "Departmental scrutiny of the application.",
          roleId: roleIdByName["Head of Department"] ?? null,
          form: reviewForm("Head of Department"),
          outcomes: [
            hodOutcomes.recommend,
            hodOutcomes.sendBack,
            hodOutcomes.reject,
          ],
        },
      },
      {
        id: ids.returnEmail,
        kind: "email",
        position: { x: 680, y: 420 },
        data: {
          label: "Notify Applicant of Changes",
          description: "Tells the applicant their application came back.",
          templateId: templateIdByName["Application Returned"] ?? null,
          recipientMode: "applicant",
          recipientRoleId: null,
          recipientEmail: "",
        },
      },
      {
        id: ids.deanEmail,
        kind: "email",
        position: { x: 1020, y: -120 },
        data: {
          label: "Notify Dean",
          description: "Alerts the Dean that a file is waiting.",
          templateId: templateIdByName["Reviewer Assignment"] ?? null,
          recipientMode: "role",
          recipientRoleId: roleIdByName["Dean"] ?? null,
          recipientEmail: "",
        },
      },
      {
        id: ids.dean,
        kind: "stage",
        position: { x: 1020, y: 60 },
        data: {
          label: "Dean Review",
          description: "Final academic decision.",
          roleId: roleIdByName["Dean"] ?? null,
          form: reviewForm("Dean"),
          outcomes: [deanOutcomes.approve, deanOutcomes.reject],
        },
      },
      {
        id: ids.approvedEmail,
        kind: "email",
        position: { x: 1360, y: -120 },
        data: {
          label: "Send Approval Letter",
          description: "",
          templateId: templateIdByName["Application Approved"] ?? null,
          recipientMode: "applicant",
          recipientRoleId: null,
          recipientEmail: "",
        },
      },
      {
        id: ids.rejectedEmail,
        kind: "email",
        position: { x: 1360, y: 420 },
        data: {
          label: "Send Outcome Letter",
          description: "",
          templateId: templateIdByName["Application Rejected"] ?? null,
          recipientMode: "applicant",
          recipientRoleId: null,
          recipientEmail: "",
        },
      },
      {
        id: ids.approvedEnd,
        kind: "end",
        position: { x: 1400, y: 60 },
        data: { label: "Approved", description: "", result: "approved" },
      },
      {
        id: ids.rejectedEnd,
        kind: "end",
        position: { x: 1400, y: 240 },
        data: { label: "Rejected", description: "", result: "rejected" },
      },
    ],
    edges: [
      // Submission continues to the HOD; the acknowledgement is sent
      // alongside it rather than in front of it.
      {
        id: "edge_start_hod",
        source: ids.start,
        sourceHandle: "out",
        target: ids.hod,
      },
      {
        id: "edge_start_ack",
        source: ids.start,
        sourceHandle: "out",
        target: ids.ackEmail,
      },

      // Recommend: on to the Dean, notifying that role in parallel.
      {
        id: "edge_hod_recommend",
        source: ids.hod,
        sourceHandle: hodOutcomes.recommend.id,
        target: ids.dean,
      },
      {
        id: "edge_hod_recommend_email",
        source: ids.hod,
        sourceHandle: hodOutcomes.recommend.id,
        target: ids.deanEmail,
      },

      // Send back: the application returns to the applicant, who is told why.
      {
        id: "edge_hod_sendback",
        source: ids.hod,
        sourceHandle: hodOutcomes.sendBack.id,
        target: ids.start,
      },
      {
        id: "edge_hod_sendback_email",
        source: ids.hod,
        sourceHandle: hodOutcomes.sendBack.id,
        target: ids.returnEmail,
      },

      // Not recommended: closed, with the outcome letter sent in parallel.
      {
        id: "edge_hod_reject",
        source: ids.hod,
        sourceHandle: hodOutcomes.reject.id,
        target: ids.rejectedEnd,
      },
      {
        id: "edge_hod_reject_email",
        source: ids.hod,
        sourceHandle: hodOutcomes.reject.id,
        target: ids.rejectedEmail,
      },

      {
        id: "edge_dean_approve",
        source: ids.dean,
        sourceHandle: deanOutcomes.approve.id,
        target: ids.approvedEnd,
      },
      {
        id: "edge_dean_approve_email",
        source: ids.dean,
        sourceHandle: deanOutcomes.approve.id,
        target: ids.approvedEmail,
      },

      {
        id: "edge_dean_reject",
        source: ids.dean,
        sourceHandle: deanOutcomes.reject.id,
        target: ids.rejectedEnd,
      },
      {
        id: "edge_dean_reject_email",
        source: ids.dean,
        sourceHandle: deanOutcomes.reject.id,
        target: ids.rejectedEmail,
      },
    ],
  };
}
