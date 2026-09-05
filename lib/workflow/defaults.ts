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

/* -------------------------------------------------------------------------- */
/*  Default email templates                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Seven messages covering the moments an application changes hands.
 *
 * Deliberately plain: they are meant to be rewritten in the template editor by
 * whoever runs the portal, so they say what happened and nothing about who
 * "we" are.
 */
export const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: "Application Received",
    subject: "Application {{application_reference}} received",
    description: "Acknowledgement sent to the applicant on submission.",
    bodyHtml: [
      "<h2>Thank you, {{applicant_name}}</h2>",
      "<p>We have received your application <strong>{{application_reference}}</strong>, submitted on {{submitted_at}}.</p>",
      "<p>It is now with <strong>{{current_stage}}</strong>. You will be told each time it moves.</p>",
      "<p>You can follow its progress from the portal at any time.</p>",
    ].join(""),
  },
  {
    name: "Application Advanced",
    subject: "Application {{application_reference}} moved to {{current_stage}}",
    description: "Progress notification sent when a stage is completed.",
    bodyHtml: [
      "<h2>Your application has moved</h2>",
      "<p>Dear {{applicant_name}},</p>",
      "<p>Application <strong>{{application_reference}}</strong> has completed <strong>{{previous_stage}}</strong> with the outcome <strong>{{last_outcome}}</strong>.</p>",
      "<p>It is now with <strong>{{current_stage}}</strong>.</p>",
    ].join(""),
  },
  {
    name: "Application Returned",
    subject: "Changes needed on application {{application_reference}}",
    description: "Sent when a reviewer sends the application back for changes.",
    bodyHtml: [
      "<h2>Your application needs changes</h2>",
      "<p>Dear {{applicant_name}},</p>",
      "<p>{{actor_name}} has returned application <strong>{{application_reference}}</strong> at the <strong>{{previous_stage}}</strong> step.</p>",
      "<p>Sign in to the portal, update your answers and send it again.</p>",
    ].join(""),
  },
  {
    name: "Application Approved",
    subject: "Your application has been approved",
    description: "Sent when the application reaches an approved end step.",
    bodyHtml: [
      "<h2>Good news, {{applicant_name}}</h2>",
      "<p>Application <strong>{{application_reference}}</strong> has been <strong>approved</strong>.</p>",
      "<p>The full record, including every reviewer's remarks, is in the portal.</p>",
    ].join(""),
  },
  {
    name: "Application Declined",
    subject: "Outcome of application {{application_reference}}",
    description: "Sent when the application reaches a declined end step.",
    bodyHtml: [
      "<h2>Application outcome</h2>",
      "<p>Dear {{applicant_name}},</p>",
      "<p>After review, application <strong>{{application_reference}}</strong> has not been approved.</p>",
      "<p>The reviewers' remarks are in the portal.</p>",
    ].join(""),
  },
  {
    name: "Filing Notice",
    subject: "Approved application {{application_reference}} for filing",
    description:
      "Sent to whoever keeps the records once an application is approved.",
    bodyHtml: [
      "<h2>An approved application is ready to file</h2>",
      "<p>Application <strong>{{application_reference}}</strong> from {{applicant_name}} has been approved.</p>",
      "<p>Open it in the portal to read the whole record.</p>",
    ].join(""),
  },
  {
    name: "Reviewer Assignment",
    subject: "Application {{application_reference}} awaits your review",
    description: "Notifies whoever the next step is waiting on.",
    bodyHtml: [
      "<h2>An application needs your review</h2>",
      "<p>Application <strong>{{application_reference}}</strong> from {{applicant_name}} has reached <strong>{{current_stage}}</strong>.</p>",
      "<p>Sign in to the portal to read it and record your decision.</p>",
    ].join(""),
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Default departments and roles                                              */
/* -------------------------------------------------------------------------- */

/**
 * Departments a fresh install starts with.
 *
 * Examples rather than anybody's real structure: departments are administered
 * from the portal, so the first thing an operator does is replace these.
 */
export const DEFAULT_DEPARTMENTS = [
  { name: "Engineering", code: "ENG" },
  { name: "Finance", code: "FIN" },
  { name: "Operations", code: "OPS" },
  { name: "People", code: "PPL" },
  { name: "Research", code: "RES" },
] as const;

export const SUPER_ADMIN_ROLE_NAME = "Super Admin";

/**
 * Listed in priority order, lowest first. The first entry is what a user gets
 * when an import or invite names no role, so it is deliberately the least
 * privileged one.
 */
export const DEFAULT_ROLES = [
  {
    name: "Applicant",
    description: "Submits and follows their own applications.",
    permissions: ["applications.apply"],
    isSystem: false,
    designation: null,
  },
  {
    name: "Department Head",
    description:
      "Heads a department. Decides who assesses an application from it, and decides the application once the assessment comes back.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: "head",
  },
  {
    name: "Deputy Head",
    description:
      "Deputises for a department head. Assesses the applications the head sends them.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: "deputy",
  },
  {
    name: "Compliance Officer",
    description:
      "Checks an approved application against the rules before it reaches the approver.",
    permissions: ["applications.review"],
    isSystem: false,
    designation: null,
  },
  {
    name: "Approver",
    description: "Gives the final decision. Nothing follows it either way.",
    permissions: ["applications.review", "applications.viewAll"],
    isSystem: false,
    designation: null,
  },
  {
    name: "Records",
    description:
      "Keeps the approved applications. Notified by email; nothing to do in the portal.",
    permissions: ["applications.viewAll"],
    isSystem: false,
    designation: null,
  },
  {
    name: "Administrator",
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
/*  The example application form                                               */
/* -------------------------------------------------------------------------- */

/**
 * The form a fresh install ships with.
 *
 * It is an example, not a specification: whoever runs the portal replaces it
 * in the form builder. It is written to demonstrate one of everything the
 * engine can do - answers taken from the account, an answer worked out from
 * its neighbours, a question that appears only when another is ticked, a
 * repeating table with typed columns, and an upload - because an example that
 * exercises nothing teaches nothing.
 */
export function defaultApplicantForm(): FormSchema {
  return {
    sections: [
      createSection(
        "What you are asking for",
        [
          createField({
            type: "select",
            key: "request_type",
            label: "Type of request",
            required: true,
            width: "half",
            options: choices(
              ["Promotion", "promotion"],
              ["Transfer", "transfer"],
              ["Training", "training"],
              ["Equipment", "equipment"],
              ["Something else", "other"],
            ),
          }),
          createField({
            type: "date",
            key: "effective_from",
            label: "Wanted from",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "title",
            label: "Title",
            required: true,
            placeholder: "One line describing the request",
            validation: { maxLength: 120 },
          }),
          // Only asked when the type does not cover it, which is the whole
          // point of a conditional question.
          createField({
            type: "textarea",
            key: "other_type_detail",
            label: "Tell us what kind of request this is",
            visibleWhen: when(rule("request_type", "equals", "other")),
            requiredWhen: when(rule("request_type", "equals", "other")),
          }),
          createField({
            type: "textarea",
            key: "justification",
            label: "Why it should be granted",
            description: "The case a reviewer will read first.",
            required: true,
            validation: { minLength: 40 },
          }),
        ],
        "The request itself. Everything else supports it.",
      ),

      createSection(
        "About you",
        [
          createField({
            type: "text",
            key: "full_name",
            label: "Full name",
            prefill: "name",
            required: true,
            width: "half",
          }),
          createField({
            type: "text",
            key: "employee_code",
            label: "Employee ID",
            prefill: "employeeId",
            width: "half",
          }),
          createField({
            type: "text",
            key: "department_name",
            label: "Department",
            prefill: "department",
            width: "half",
          }),
          createField({
            type: "text",
            key: "job_title",
            label: "Job title",
            prefill: "designation",
            width: "half",
          }),
          createField({
            type: "date",
            key: "joined_on",
            label: "Date you joined",
            prefill: "dateOfJoining",
            width: "half",
          }),
          createField({
            type: "phone",
            key: "contact_number",
            label: "Contact number",
            prefill: "phone",
            required: true,
            width: "half",
          }),
        ],
        "Taken from your account where the portal already knows it. Anything blank or wrong should be corrected by an administrator.",
      ),

      createSection(
        "What it costs",
        [
          createField({
            type: "number",
            key: "cost_direct",
            label: "Direct cost",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          createField({
            type: "number",
            key: "cost_indirect",
            label: "Indirect cost",
            required: true,
            width: "half",
            validation: { min: 0 },
          }),
          // Added up rather than asked for, so the total can never disagree
          // with the two figures above it.
          createField({
            type: "number",
            key: "cost_total",
            label: "Total cost",
            description: "Worked out from the two figures above.",
            formula: "cost_direct + cost_indirect",
            width: "half",
          }),
          createField({
            type: "checkbox",
            key: "needs_funding",
            label: "This needs funding from outside my department",
          }),
          createField({
            type: "text",
            key: "funding_source",
            label: "Where the funding comes from",
            requiredWhen: when(rule("needs_funding", "isChecked")),
          }),
        ],
        "Leave the costs at zero if the request has none.",
      ),

      createSection(
        "Anything before this",
        [
          createRepeater(
            {
              key: "earlier_requests",
              label: "Earlier requests of the same kind",
              description:
                "Add a row for each one. Leave it empty if this is your first.",
              validation: { maxRows: 10 },
            },
            [
              createField({
                type: "text",
                key: "reference",
                label: "Reference",
                required: true,
                width: "half",
              }),
              createField({
                type: "number",
                key: "year",
                label: "Year",
                required: true,
                width: "half",
                validation: { min: 1950, max: 2200 },
              }),
              createField({
                type: "select",
                key: "outcome",
                label: "Outcome",
                required: true,
                width: "half",
                options: choices(
                  ["Approved", "approved"],
                  ["Declined", "declined"],
                  ["Withdrawn", "withdrawn"],
                ),
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
        "A reviewer reads this beside the request itself.",
      ),

      createSection(
        "Documents",
        [
          createField({
            type: "file",
            key: "supporting_document",
            label: "Supporting document",
            description: "One PDF, up to 10 MB.",
            required: true,
            validation: { acceptedFileTypes: ["application/pdf"], maxFiles: 1 },
          }),
          createField({
            type: "file",
            key: "extra_documents",
            label: "Anything else worth attaching",
            description: "Up to five files.",
            validation: { maxFiles: 5 },
          }),
        ],
        "Uploads are attached to the application and printed with it.",
      ),

      createSection(
        "Declaration",
        [
          createField({
            type: "paragraph",
            key: "declaration_text",
            label:
              "Everything above will be read by the people who decide this request, and kept with the record of it.",
          }),
          createField({
            type: "checkbox",
            key: "declaration",
            label: "I confirm that what I have written here is true.",
            required: true,
          }),
        ],
        "The last step before it is sent.",
      ),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  The example reviewer forms                                                 */
/* -------------------------------------------------------------------------- */

/** What the deputy the head named records before it goes back. */
function assessmentForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Assessment",
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
        "Read the application before recording your assessment. It goes back to the head, who decides.",
      ),
    ],
  };
}

/** The head's own words, once the assessment is in front of them. */
function decisionForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Decision",
        [
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            required: true,
          }),
        ],
        "Approving sends the application on to Compliance; declining closes it.",
      ),
    ],
  };
}

function complianceForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Compliance",
        [
          createField({
            type: "radio",
            key: "within_policy",
            label: "Is this within policy?",
            required: true,
            options: choices(
              ["Yes", "yes"],
              ["Yes, with the conditions below", "conditional"],
              ["No", "no"],
            ),
          }),
          createField({
            type: "textarea",
            key: "conditions",
            label: "Conditions",
            visibleWhen: when(rule("within_policy", "equals", "conditional")),
            requiredWhen: when(rule("within_policy", "equals", "conditional")),
          }),
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            required: true,
          }),
        ],
        "A verdict here is carried forward rather than applied: the approver decides.",
      ),
    ],
  };
}

function approvalForm(): FormSchema {
  return {
    sections: [
      createSection(
        "Final decision",
        [
          createField({
            type: "textarea",
            key: "remarks",
            label: "Remarks",
            required: true,
          }),
        ],
        "Whichever outcome you choose closes the application.",
      ),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  The example workflow                                                       */
/* -------------------------------------------------------------------------- */

export type DefaultGraphInput = {
  roleIdByName: Record<string, string>;
  templateIdByName: Record<string, string>;
};

/**
 * The process a fresh install runs:
 *
 *   Submission -> Department Review -> Deputy Assessment -> Department Decision
 *                       |- returned for changes -> Submission
 *                       `- declined -> closed
 *                                             Department Decision
 *                                               |- declined -> closed
 *                                               `- approved -> Compliance Check
 *                                                                -> Final Approval
 *                                                                     |- approved
 *                                                                     `- rejected
 *
 * Like the form, it is an example - the whole point of the portal is that an
 * administrator redraws it - but it is a working one, and it exercises every
 * routing rule the engine has: a step scoped to the applicant's own department,
 * a step held for one person the previous reviewer names, a branch that sends
 * the application back to its author, branches that close it early, and
 * notifications that ride alongside each hand-off rather than in front of it.
 */
export function defaultWorkflowGraph({
  roleIdByName,
  templateIdByName,
}: DefaultGraphInput): WorkflowGraph {
  const outcomes = {
    delegate: createOutcome("Send for assessment", "positive"),
    returnToApplicant: createOutcome("Return for changes", "neutral", false),
    headDecline: createOutcome("Decline", "negative"),
    assessed: createOutcome("Return to the head", "positive"),
    headApprove: createOutcome("Approve", "positive"),
    headReject: createOutcome("Decline", "negative"),
    checked: createOutcome("Forward for approval", "positive"),
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
   * holders attached to the applicant's own department, or to the one person
   * the application has just been handed to.
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
        label: "Application",
        description:
          "The form an applicant fills in. Everything after this reads what it collected.",
        form: defaultApplicantForm(),
      },
    },
    toApplicant(
      "node_email_received",
      "Acknowledge the applicant",
      "Application Received",
      { x: column(1), y: 520 },
    ),
    toRole(
      "node_email_head_assigned",
      "Notify the department head",
      "Reviewer Assignment",
      "Department Head",
      { x: column(1), y: 60 },
      "applicant_department",
    ),

    {
      id: "node_stage_department_review",
      kind: "stage",
      position: { x: column(2), y: 300 },
      data: {
        label: "Department Review",
        description:
          "The head of the applicant's own department decides who should assess this - or sends it back for changes, or declines it outright. Nothing is written up here: the head has the last word once the assessment comes back.",
        roleId: role("Department Head"),
        form: emptyForm(),
        outcomes: [
          outcomes.delegate,
          outcomes.returnToApplicant,
          outcomes.headDecline,
        ],
        assignment: departmentHolder,
      },
    },
    toApplicant(
      "node_email_returned",
      "Tell the applicant: changes needed",
      "Application Returned",
      { x: column(3), y: 760 },
    ),
    toApplicant(
      "node_email_head_declined",
      "Tell the applicant: declined",
      "Application Declined",
      { x: column(3), y: 940 },
    ),
    {
      id: "node_end_declined",
      kind: "end",
      position: { x: column(4), y: 940 },
      data: {
        label: "Closed - Declined",
        description: "The department declined the request.",
        result: "rejected",
      },
    },
    toApplicant(
      "node_email_assessment_started",
      "Tell the applicant: being assessed",
      "Application Advanced",
      { x: column(3), y: 520 },
    ),
    toRole(
      "node_email_deputy_assigned",
      "Notify the deputy",
      "Reviewer Assignment",
      "Deputy Head",
      { x: column(3), y: 60 },
      // Only the person the head named: the department's other deputies are
      // not being asked for anything.
      "assigned_person",
    ),

    {
      id: "node_stage_assessment",
      kind: "stage",
      position: { x: column(4), y: 300 },
      data: {
        label: "Deputy Assessment",
        description:
          "The deputy the head named reads the application, records an assessment and sends it back.",
        roleId: role("Deputy Head"),
        form: assessmentForm(),
        outcomes: [outcomes.assessed],
        // Not offered to the deputies at large: the head names one of their
        // own department's, and the file is held for that person alone.
        assignment: {
          mode: "nominated",
          pool: "department_deputies",
          scope: "all_holders",
        },
      },
    },
    toApplicant(
      "node_email_assessed",
      "Tell the applicant: back with the head",
      "Application Advanced",
      { x: column(5), y: 520 },
    ),
    toRole(
      "node_email_head_decision",
      "Notify the head: assessment in",
      "Reviewer Assignment",
      "Department Head",
      { x: column(5), y: 60 },
      "applicant_department",
    ),

    {
      id: "node_stage_department_decision",
      kind: "stage",
      position: { x: column(6), y: 300 },
      data: {
        label: "Department Decision",
        description:
          "The head reads the assessment and either approves the request, sending it on to Compliance, or declines it.",
        roleId: role("Department Head"),
        form: decisionForm(),
        outcomes: [outcomes.headApprove, outcomes.headReject],
        assignment: departmentHolder,
      },
    },
    toApplicant(
      "node_email_department_approved",
      "Tell the applicant: with Compliance",
      "Application Advanced",
      { x: column(7), y: 520 },
    ),
    toRole(
      "node_email_compliance_assigned",
      "Notify Compliance",
      "Reviewer Assignment",
      "Compliance Officer",
      { x: column(7), y: 60 },
    ),

    {
      id: "node_stage_compliance",
      kind: "stage",
      position: { x: column(8), y: 300 },
      data: {
        label: "Compliance Check",
        description:
          "Checked against the rules. The verdict travels with the application rather than closing it.",
        roleId: role("Compliance Officer"),
        form: complianceForm(),
        outcomes: [outcomes.checked],
        assignment: anyHolder,
      },
    },
    toApplicant(
      "node_email_compliance_done",
      "Tell the applicant: awaiting approval",
      "Application Advanced",
      { x: column(9), y: 520 },
    ),
    toRole(
      "node_email_approver_assigned",
      "Notify the approver",
      "Reviewer Assignment",
      "Approver",
      { x: column(9), y: 60 },
    ),

    {
      id: "node_stage_approval",
      kind: "stage",
      position: { x: column(10), y: 300 },
      data: {
        label: "Final Approval",
        description: "The last word. Nothing follows it either way.",
        roleId: role("Approver"),
        form: approvalForm(),
        outcomes: [outcomes.approve, outcomes.reject],
        assignment: anyHolder,
      },
    },
    toApplicant(
      "node_email_approved",
      "Tell the applicant: approved",
      "Application Approved",
      { x: column(11), y: 60 },
    ),
    toRole(
      "node_email_filing",
      "Send it to Records for filing",
      "Filing Notice",
      "Records",
      { x: column(11), y: 180 },
    ),
    {
      id: "node_end_approved",
      kind: "end",
      position: { x: column(12), y: 120 },
      data: {
        label: "Approved",
        description: "The request was approved.",
        result: "approved",
      },
    },
    toApplicant(
      "node_email_rejected",
      "Tell the applicant: rejected",
      "Application Declined",
      { x: column(11), y: 460 },
    ),
    {
      id: "node_end_rejected",
      kind: "end",
      position: { x: column(12), y: 420 },
      data: {
        label: "Closed - Rejected",
        description: "The approver rejected the request.",
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
      ...hop("node_submission", OUT, "node_stage_department_review", [
        "node_email_received",
        "node_email_head_assigned",
      ]),
      ...hop(
        "node_stage_department_review",
        outcomes.delegate.id,
        "node_stage_assessment",
        ["node_email_assessment_started", "node_email_deputy_assigned"],
      ),
      // Back to the applicant's own form: the one branch that does not go
      // forward, and the reason a stage can point at the submission step.
      ...hop(
        "node_stage_department_review",
        outcomes.returnToApplicant.id,
        "node_submission",
        ["node_email_returned"],
      ),
      ...hop(
        "node_stage_department_review",
        outcomes.headDecline.id,
        "node_end_declined",
        ["node_email_head_declined"],
      ),
      ...hop(
        "node_stage_assessment",
        outcomes.assessed.id,
        "node_stage_department_decision",
        ["node_email_assessed", "node_email_head_decision"],
      ),
      ...hop(
        "node_stage_department_decision",
        outcomes.headApprove.id,
        "node_stage_compliance",
        ["node_email_department_approved", "node_email_compliance_assigned"],
      ),
      ...hop(
        "node_stage_department_decision",
        outcomes.headReject.id,
        "node_end_declined",
        ["node_email_head_declined"],
      ),
      ...hop(
        "node_stage_compliance",
        outcomes.checked.id,
        "node_stage_approval",
        ["node_email_compliance_done", "node_email_approver_assigned"],
      ),
      ...hop("node_stage_approval", outcomes.approve.id, "node_end_approved", [
        "node_email_approved",
        "node_email_filing",
      ]),
      ...hop("node_stage_approval", outcomes.reject.id, "node_end_rejected", [
        "node_email_rejected",
      ]),
    ],
  };
}
