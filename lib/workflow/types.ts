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
});
export type FieldValidation = z.infer<typeof fieldValidationSchema>;

export const formFieldSchema = z.object({
  id: z.string().min(1),
  /** Stable machine key used inside the application data document. */
  key: z
    .string()
    .min(1, "Field key is required")
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/,
      "Key must start with a letter or underscore and contain only letters, digits and underscores",
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
});
export type FormField = z.infer<typeof formFieldSchema>;

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
});
export type StageNodeData = z.infer<typeof stageNodeDataSchema>;

export const RECIPIENT_MODES = ["applicant", "role", "custom"] as const;
export const recipientModeSchema = z.enum(RECIPIENT_MODES);
export type RecipientMode = z.infer<typeof recipientModeSchema>;

export const emailNodeDataSchema = z.object({
  label: z.string().min(1).default("Send Email"),
  description: z.string().optional().default(""),
  templateId: z.string().nullable().default(null),
  recipientMode: recipientModeSchema.default("applicant"),
  /** Used when recipientMode is `role`. */
  recipientRoleId: z.string().nullable().default(null),
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

export type FormValue =
  string | number | boolean | string[] | FileValue | FileValue[] | null;

export type FileValue = {
  id: string;
  key: string;
  name: string;
  size: number;
  contentType: string;
};

export type SectionData = Record<string, FormValue>;

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
    key: "portal_url",
    description: "Link to the portal home page",
  },
  {
    key: "application_url",
    description: "Direct link to this application",
  },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type TemplateVariables = Partial<Record<TemplateVariableKey, string>>;
