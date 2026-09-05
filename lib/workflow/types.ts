import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  Form engine                                                                */
/* -------------------------------------------------------------------------- */

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "email",
  "phone",
  "date",
  "select",
  "radio",
  "multiselect",
  "checkbox",
  "file",
  "repeater",
  "heading",
  "paragraph",
] as const;

export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/** Presentational field types carry no value and are skipped by validation. */
export const DISPLAY_FIELD_TYPES: readonly FieldType[] = [
  "heading",
  "paragraph",
];

export function isDisplayField(type: FieldType) {
  return DISPLAY_FIELD_TYPES.includes(type);
}

export const CHOICE_FIELD_TYPES: readonly FieldType[] = [
  "select",
  "radio",
  "multiselect",
];

export function hasChoices(type: FieldType) {
  return CHOICE_FIELD_TYPES.includes(type);
}

export const fieldOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Option label is required"),
  value: z.string().min(1, "Option value is required"),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

export const fieldValidationSchema = z.object({
  minLength: z.number().int().nonnegative().nullable().optional(),
  maxLength: z.number().int().positive().nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  /** JavaScript-flavoured regex source, applied to text-like values. */
  pattern: z.string().nullable().optional(),
  patternMessage: z.string().nullable().optional(),
  /** File fields only. */
  maxFileSizeMb: z.number().positive().max(100).nullable().optional(),
  acceptedFileTypes: z.array(z.string()).nullable().optional(),
  maxFiles: z.number().int().positive().max(20).nullable().optional(),
  /** Repeating groups only. */
  minRows: z.number().int().nonnegative().max(100).nullable().optional(),
  maxRows: z.number().int().positive().max(100).nullable().optional(),
});
export type FieldValidation = z.infer<typeof fieldValidationSchema>;

export const CONDITION_OPERATORS = [
  { key: "equals", label: "is" },
  { key: "notEquals", label: "is not" },
  { key: "isFilled", label: "has been answered", valueless: true },
  { key: "isEmpty", label: "has been left blank", valueless: true },
  { key: "isChecked", label: "is ticked", valueless: true },
  { key: "isNotChecked", label: "is not ticked", valueless: true },
  { key: "greaterThan", label: "is more than" },
  { key: "lessThan", label: "is less than" },
] as const;

export const conditionOperatorSchema = z.enum([
  "equals",
  "notEquals",
  "isFilled",
  "isEmpty",
  "isChecked",
  "isNotChecked",
  "greaterThan",
  "lessThan",
]);
export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

/** True when the operator needs nothing to compare against. */
export function isValuelessOperator(operator: string): boolean {
  return CONDITION_OPERATORS.some(
    (entry) => entry.key === operator && "valueless" in entry,
  );
}

/**
 * One test against another answer in the same scope: a field of the same form,
 * or a sibling column of the same entry.
 */
export const conditionRuleSchema = z.object({
  id: z.string().min(1),
  /** Key of the answer being tested. */
  field: z.string().min(1),
  operator: conditionOperatorSchema,
  value: z.string().default(""),
});
export type ConditionRule = z.infer<typeof conditionRuleSchema>;

export const conditionGroupSchema = z.object({
  mode: z.enum(["all", "any"]).default("all"),
  rules: z.array(conditionRuleSchema).default([]),
});
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

/**
 * One column of a repeating group.
 *
 * Identical to a field in every respect but one: it has no `fields` of its own,
 * because a repeating group cannot contain another. Nesting them would make an
 * answer arbitrarily deep, which neither the storage shape nor anybody reading
 * a printed application would thank us for.
 */
export const columnFieldSchema = z.object({
  id: z.string().min(1),
  /** Stable machine key used inside the application data document. */
  key: z
    .string()
    .min(1, "Field key is required")
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/,
      "Use letters, digits and underscores only, starting with a letter",
    ),
  type: fieldTypeSchema,
  label: z.string().min(1, "Label is required"),
  description: z.string().optional().default(""),
  placeholder: z.string().optional().default(""),
  required: z.boolean().default(false),
  options: z.array(fieldOptionSchema).default([]),
  validation: fieldValidationSchema.default({}),
  /** Half-width fields sit two-per-row on desktop. */
  width: z.enum(["full", "half"]).default("full"),
  /**
   * Filled in from the applicant's own account, naming a key from
   * `lib/users/profile.ts`. A field whose account value is there is shown
   * read-only; one the account cannot answer stays an ordinary question, so
   * nobody is ever stuck unable to say something the portal did not know.
   */
  prefill: z.string().nullable().default(null),
  /**
   * Worked out from the answers beside it rather than typed - see
   * `lib/workflow/calc.ts`. Number fields only.
   */
  formula: z.string().nullable().default(null),
  /** Shown only while this holds. Null means always. */
  visibleWhen: conditionGroupSchema.nullable().default(null),
  /** Required only while this holds. Null falls back to `required`. */
  requiredWhen: conditionGroupSchema.nullable().default(null),
});
export type ColumnField = z.infer<typeof columnFieldSchema>;

export const formFieldSchema = columnFieldSchema.extend({
  /** Columns of a repeating group. Empty for every other field type. */
  fields: z.array(columnFieldSchema).default([]),
});
export type FormField = z.infer<typeof formFieldSchema>;

/**
 * Whatever the renderer, the compiler and the preview are handed: a field of a
 * section, or one column of a repeating group.
 */
export type AnyField = ColumnField & { fields?: ColumnField[] };

/** The columns of a repeating group, or nothing for any other field. */
export function columnsOf(field: AnyField): ColumnField[] {
  return field.type === "repeater" ? (field.fields ?? []) : [];
}

export const formSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Section title is required"),
  description: z.string().optional().default(""),
  fields: z.array(formFieldSchema).default([]),
});
export type FormSection = z.infer<typeof formSectionSchema>;

export const formSchemaSchema = z.object({
  sections: z.array(formSectionSchema).default([]),
});
export type FormSchema = z.infer<typeof formSchemaSchema>;

export const emptyForm = (): FormSchema => ({ sections: [] });

/* -------------------------------------------------------------------------- */
/*  Workflow graph                                                             */
/* -------------------------------------------------------------------------- */

export const NODE_KINDS = ["start", "stage", "email", "end"] as const;
export const nodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof nodeKindSchema>;

/**
 * A named branch out of a stage node. Each outcome renders as its own source
 * handle on the canvas, so the reviewer's button choice selects the edge.
 */
export const OUTCOME_TONES = ["positive", "negative", "neutral"] as const;
export const outcomeToneSchema = z.enum(OUTCOME_TONES);
export type OutcomeTone = z.infer<typeof outcomeToneSchema>;

export const stageOutcomeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Outcome label is required"),
  tone: outcomeToneSchema.default("neutral"),
  /** When true the reviewer must fill the stage form before choosing this. */
  requiresForm: z.boolean().default(true),
});
export type StageOutcome = z.infer<typeof stageOutcomeSchema>;

/**
 * How a stage finds the person who acts on it.
 *
 * `role` offers it to everyone holding the stage's role, which is the ordinary
 * case. `nominated` holds it for one person the previous reviewer names, drawn
 * from `pool`: either the deputies of the applicant's own department, or
 * everyone holding this stage's role.
 */
export const NOMINEE_POOLS = ["role_holders", "department_deputies"] as const;
export const nomineePoolSchema = z.enum(NOMINEE_POOLS);
export type NomineePool = z.infer<typeof nomineePoolSchema>;

/**
 * Which holders of a role a step or a notification actually reaches.
 *
 * A role is institute-wide, but many of the posts that hold one are not: there
 * is a head of every department, and an application concerns exactly one of them.
 * Narrowing by department is therefore a property of the step, not something the
 * process can be trusted to arrange by having a separate role per department.
 *
 * `applicant_department` means the holders attached to the applicant's own department
 * - the people who sign for it, and anyone whose account names it.
 */
export const AUDIENCE_SCOPES = ["all_holders", "applicant_department"] as const;
export const audienceScopeSchema = z.enum(AUDIENCE_SCOPES);
export type AudienceScope = z.infer<typeof audienceScopeSchema>;

export const stageAssignmentSchema = z.object({
  mode: z.enum(["role", "nominated"]).default("role"),
  pool: nomineePoolSchema.default("role_holders"),
  /**
   * Narrows both who is offered the stage and who may be named for it. Old
   * snapshots carry no scope and default to the whole role, which is what they
   * meant when they were published.
   */
  scope: audienceScopeSchema.default("all_holders"),
});
export type StageAssignment = z.infer<typeof stageAssignmentSchema>;

export const startNodeDataSchema = z.object({
  label: z.string().min(1).default("Applicant Submission"),
  description: z.string().optional().default(""),
  form: formSchemaSchema.default({ sections: [] }),
});
export type StartNodeData = z.infer<typeof startNodeDataSchema>;

export const stageNodeDataSchema = z.object({
  label: z.string().min(1).default("Review Stage"),
  description: z.string().optional().default(""),
  /** Role authorised to act. Null means the stage is unassigned (invalid). */
  roleId: z.string().nullable().default(null),
  form: formSchemaSchema.default({ sections: [] }),
  outcomes: z.array(stageOutcomeSchema).default([]),
  /**
   * Who takes this stage.
   *
   * It sits on the stage that is entered rather than on the one handing over,
   * so a reviewer is asked for a name only on the branch that leads somewhere
   * needing one: the head naming an deputy when they delegate, and not
   * on a branch that goes to a whole role.
   */
  assignment: stageAssignmentSchema.default({
    mode: "role",
    pool: "role_holders",
    scope: "all_holders",
  }),
});
export type StageNodeData = z.infer<typeof stageNodeDataSchema>;

export const RECIPIENT_MODES = ["applicant", "role", "custom"] as const;
export const recipientModeSchema = z.enum(RECIPIENT_MODES);
export type RecipientMode = z.infer<typeof recipientModeSchema>;

/** The audience scopes, plus the one only a notification can mean. */
export const RECIPIENT_SCOPES = [
  ...AUDIENCE_SCOPES,
  "assigned_person",
] as const;
export const recipientScopeSchema = z.enum(RECIPIENT_SCOPES);
export type RecipientScope = z.infer<typeof recipientScopeSchema>;

export const emailNodeDataSchema = z.object({
  label: z.string().min(1).default("Send Email"),
  description: z.string().optional().default(""),
  templateId: z.string().nullable().default(null),
  recipientMode: recipientModeSchema.default("applicant"),
  /** Used when recipientMode is `role`. */
  recipientRoleId: z.string().nullable().default(null),
  /**
   * Narrows a role-addressed message. Beyond the scopes a stage can take, a
   * notification may also be addressed to the one person the application has
   * just been handed to, which is what a "the file is now yours" message
   * means.
   */
  recipientScope: recipientScopeSchema.default("all_holders"),
  /** Used when recipientMode is `custom`. */
  recipientEmail: z.string().default(""),
});
export type EmailNodeData = z.infer<typeof emailNodeDataSchema>;

export const END_RESULTS = ["approved", "rejected", "withdrawn"] as const;
export const endResultSchema = z.enum(END_RESULTS);
export type EndResult = z.infer<typeof endResultSchema>;

export const endNodeDataSchema = z.object({
  label: z.string().min(1).default("End"),
  description: z.string().optional().default(""),
  result: endResultSchema.default("approved"),
});
export type EndNodeData = z.infer<typeof endNodeDataSchema>;

export const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const workflowNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("start"),
    position: nodePositionSchema,
    data: startNodeDataSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("stage"),
    position: nodePositionSchema,
    data: stageNodeDataSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("email"),
    position: nodePositionSchema,
    data: emailNodeDataSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("end"),
    position: nodePositionSchema,
    data: endNodeDataSchema,
  }),
]);
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export type StartNode = Extract<WorkflowNode, { kind: "start" }>;
export type StageNode = Extract<WorkflowNode, { kind: "stage" }>;
export type EmailNode = Extract<WorkflowNode, { kind: "email" }>;
export type EndNode = Extract<WorkflowNode, { kind: "end" }>;

/** Handle id used by every node that has exactly one way out. */
export const DEFAULT_SOURCE_HANDLE = "out";

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  /** Outcome id for stage nodes, `out` for start/email nodes. */
  sourceHandle: z.string().min(1).default(DEFAULT_SOURCE_HANDLE),
  target: z.string().min(1),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).default([]),
  edges: z.array(workflowEdgeSchema).default([]),
});
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

/* -------------------------------------------------------------------------- */
/*  Application data document                                                  */
/* -------------------------------------------------------------------------- */

/** Namespace holding the applicant's own submission. */
export const APPLICANT_NAMESPACE = "applicant";

/** Everything a single input can hold. */
export type ScalarValue =
  string | number | boolean | string[] | FileValue | FileValue[] | null;

/** One entry of a repeating group: its columns, keyed by column key. */
export type RowValue = Record<string, ScalarValue>;

export type FormValue = ScalarValue | RowValue[];

export type FileValue = {
  id: string;
  key: string;
  name: string;
  size: number;
  contentType: string;
};

export type SectionData = Record<string, FormValue>;

/**
 * True for the array of entries a repeating group stores.
 *
 * Told apart from the other arrays a field can hold - a multi-select's strings
 * and a file field's uploads - by what is inside it, since an empty array is
 * ambiguous and belongs to whichever field asked for it.
 */
export function isRowArray(value: unknown): value is RowValue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        !("contentType" in entry),
    )
  );
}

/**
 * `applicant` holds the submission node payload; every other key is a stage
 * node id, keeping each reviewer's answers in an isolated namespace.
 */
export type ApplicationData = Record<string, SectionData>;

/* -------------------------------------------------------------------------- */
/*  Email templates                                                            */
/* -------------------------------------------------------------------------- */

/** Opaque TipTap JSON document. */
export type EmailTemplateDoc = { type: string; content?: unknown[] };

export const TEMPLATE_VARIABLES = [
  {
    key: "applicant_name",
    description: "Full name of the applicant",
  },
  {
    key: "applicant_email",
    description: "Email address of the applicant",
  },
  {
    key: "application_reference",
    description: "Human-readable application reference",
  },
  {
    key: "application_status",
    description: "Current application status",
  },
  {
    key: "current_stage",
    description: "Label of the stage the application is on",
  },
  {
    key: "previous_stage",
    description: "Label of the stage that was just completed",
  },
  {
    key: "last_outcome",
    description: "Outcome chosen at the previous stage",
  },
  {
    key: "actor_name",
    description: "Name of the person who performed the last action",
  },
  {
    key: "submitted_at",
    description: "Date the application was submitted",
  },
  {
    key: "application_url",
    description: "Direct link to this application",
  },
  // There is deliberately no variable for the portal itself: a link that
  // always points at the same place is just a link, and the editor lets an
  // author write whichever one they mean.
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type TemplateVariables = Partial<Record<TemplateVariableKey, string>>;
