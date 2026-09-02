import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type {
  ApplicationData,
  EmailTemplateDoc,
  SectionData,
  WorkflowGraph,
} from "@/lib/workflow/types";
import type { RolePermission } from "@/lib/auth/permissions";
import type { RoleDesignation, RoleGrantSource } from "@/lib/auth/designations";

/* -------------------------------------------------------------------------- */
/*  Better Auth core tables                                                    */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),

  /* Portal-specific columns. */
  employeeId: text("employee_id"),
  /**
   * The school the person belongs to. What used to be a typed department name
   * is a reference now, because the promotion route depends on it: an
   * application goes to the dean of this school, and from there to one of its
   * associate deans.
   */
  schoolId: text("school_id").references((): AnyPgColumn => school.id, {
    onDelete: "set null",
  }),
  designation: text("designation"),
  /** False until the invitee completes the password-reset activation flow. */
  activated: boolean("activated").default(false).notNull(),
  /** Admins disable access without deleting history. */
  disabled: boolean("disabled").default(false).notNull(),

  /*
   * Better Auth's admin plugin owns the four columns below. Only `role`
   * carries any meaning here, and only one: whether this account may act as
   * another. It is derived from the portal's own permissions by
   * `syncAdminFlags` and must never be edited by hand - the roles a person
   * actually holds live in `user_role`. The ban columns exist because the
   * plugin's schema declares them; the portal disables access with `disabled`.
   */
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Set by Better Auth's admin plugin while this session belongs to somebody
     * an administrator is acting as: the administrator's own user id.
     */
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_issuer_account_id_uidx").on(
      table.issuer,
      table.accountId,
    ),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/* -------------------------------------------------------------------------- */
/*  Schools                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A school of the institute, with the people who sign for it.
 *
 * The dean is a single named person; the associate deans are a set, because a
 * school has several and the dean chooses which of them reviews a given
 * application. Both are references rather than names so removing an account
 * cannot leave a school pointing at somebody who is gone.
 */
export const school = pgTable(
  "school",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Short form used where the full name will not fit, e.g. SCCE. */
    code: text("code"),
    deanId: text("dean_id").references((): AnyPgColumn => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("school_name_uidx").on(table.name)],
);

export const schoolAssociateDean = pgTable(
  "school_associate_dean",
  {
    schoolId: text("school_id")
      .notNull()
      .references(() => school.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.schoolId, table.userId] }),
    index("school_associate_dean_user_id_idx").on(table.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  RBAC                                                                       */
/* -------------------------------------------------------------------------- */

export const role = pgTable(
  "role",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Permission keys granted to the role. `*` grants everything and is
     * reserved for the seeded Super Admin.
     */
    permissions: jsonb("permissions")
      .$type<RolePermission[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * Rank within the role list, lowest first. Admins set it by dragging, and
     * the lowest-numbered role is what a user gets when none is specified.
     */
    priority: integer("priority").default(0).notNull(),
    /** System roles cannot be deleted, only renamed. */
    isSystem: boolean("is_system").default(false).notNull(),
    /**
     * Which standing post this role represents, if any (`lib/auth/designations`).
     * Roles are renameable, so this - not the name - is what schools and the
     * workflow key off. At most one role may carry each designation.
     */
    designation: text("designation").$type<RoleDesignation>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("role_name_uidx").on(table.name),
    // Postgres treats nulls as distinct, so any number of roles may carry no
    // designation while each designation belongs to exactly one role.
    uniqueIndex("role_designation_uidx").on(table.designation),
    index("role_priority_idx").on(table.priority),
  ],
);

export const userRole = pgTable(
  "user_role",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    /**
     * Who granted it. A grant that came from a school posting is withdrawn
     * when the posting ends; one an admin made by hand outlives every posting.
     */
    source: text("source").$type<RoleGrantSource>().default("manual").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("user_role_role_id_idx").on(table.roleId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Workflow (single global definition)                                        */
/* -------------------------------------------------------------------------- */

/**
 * The one workflow the portal runs. There is a single row, so it carries no
 * name or description of its own - there is nothing to tell it apart from.
 */
export const workflow = pgTable("workflow", {
  /** Always `SINGLETON_WORKFLOW_ID` - the portal runs one common workflow. */
  id: text("id").primaryKey(),
  /** Editable draft graph. */
  graph: jsonb("graph").$type<WorkflowGraph>().notNull(),
  /** Immutable copy applications are started against. Null until published. */
  publishedGraph: jsonb("published_graph").$type<WorkflowGraph | null>(),
  version: integer("version").default(0).notNull(),
  publishedAt: timestamp("published_at"),
  publishedBy: text("published_by").references(() => user.id, {
    onDelete: "set null",
  }),
  /** When false, applicants cannot start new applications. */
  acceptingApplications: boolean("accepting_applications")
    .default(false)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Every published revision, newest version number highest. Restoring an old
 * revision loads it back onto the canvas as the draft; it only goes live when
 * an admin publishes again, which writes a further row here.
 */
export const workflowVersion = pgTable(
  "workflow_version",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    graph: jsonb("graph").$type<WorkflowGraph>().notNull(),
    /** Optional note the publisher left explaining the change. */
    memo: text("memo"),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Kept alongside the id so history survives the account being removed. */
    publishedByName: text("published_by_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workflow_version_workflow_version_uidx").on(
      table.workflowId,
      table.version,
    ),
    index("workflow_version_created_at_idx").on(table.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Email templates                                                            */
/* -------------------------------------------------------------------------- */

export const emailTemplate = pgTable(
  "email_template",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    /** Rendered HTML produced by the TipTap editor. */
    bodyHtml: text("body_html").notNull(),
    /** TipTap JSON document, kept so the editor can round-trip losslessly. */
    bodyJson: jsonb("body_json").$type<EmailTemplateDoc | null>(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("email_template_name_uidx").on(table.name)],
);

/* -------------------------------------------------------------------------- */
/*  Applications                                                               */
/* -------------------------------------------------------------------------- */

export const applicationStatus = pgEnum("application_status", [
  "draft",
  "in_progress",
  "approved",
  "rejected",
  "withdrawn",
]);

export const application = pgTable(
  "application",
  {
    id: text("id").primaryKey(),
    /** Human-readable reference, e.g. PROM-2026-0007. */
    reference: text("reference").notNull(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: applicationStatus("status").default("draft").notNull(),
    /**
     * Snapshot of the published graph taken when the application was created.
     * Admin edits to the live workflow never mutate in-flight applications.
     */
    graph: jsonb("graph").$type<WorkflowGraph>().notNull(),
    workflowVersion: integer("workflow_version").notNull(),
    /** Node the application is currently parked on. */
    currentNodeId: text("current_node_id"),
    /**
     * Who the current stage was nominated to, when the previous reviewer chose
     * a person rather than leaving it to the whole role. Null means anyone
     * holding the stage's role may act.
     */
    assignedToId: text("assigned_to_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /**
     * Namespaced form data: `applicant` holds the submission node payload and
     * every other key is a stage node id.
     */
    data: jsonb("data")
      .$type<ApplicationData>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    submittedAt: timestamp("submitted_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("application_reference_uidx").on(table.reference),
    index("application_applicant_id_idx").on(table.applicantId),
    index("application_status_idx").on(table.status),
    index("application_current_node_id_idx").on(table.currentNodeId),
  ],
);

export const applicationEventType = pgEnum("application_event_type", [
  "created",
  "submitted",
  "stage_completed",
  // Email is delivered asynchronously: the transition records the hand-off to
  // the queue, and the worker records what became of it.
  "email_queued",
  "email_sent",
  "email_failed",
  "completed",
  "withdrawn",
  "reopened",
]);

export const applicationEvent = pgTable(
  "application_event",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    type: applicationEventType("type").notNull(),
    nodeId: text("node_id"),
    nodeLabel: text("node_label"),
    outcomeId: text("outcome_id"),
    outcomeLabel: text("outcome_label"),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorName: text("actor_name"),
    note: text("note"),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("application_event_application_id_idx").on(table.applicationId),
  ],
);

/**
 * Partially-filled reviewer sub-forms. Applicant drafts live directly on the
 * application row (status `draft`), reviewer drafts are per user + node so two
 * reviewers holding the same role never clobber each other.
 */
export const stageDraft = pgTable(
  "stage_draft",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    data: jsonb("data")
      .$type<SectionData>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("stage_draft_app_node_user_uidx").on(
      table.applicationId,
      table.nodeId,
      table.userId,
    ),
  ],
);

/** Metadata for every object uploaded to S3/MinIO through a file field. */
export const applicationFile = pgTable(
  "application_file",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").references(() => application.id, {
      onDelete: "cascade",
    }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Set once the client confirms the direct-to-bucket PUT succeeded. */
    confirmed: boolean("confirmed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("application_file_object_key_uidx").on(table.objectKey),
    index("application_file_application_id_idx").on(table.applicationId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Audit log                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Append-only record of everything anyone does in the portal.
 *
 * The actor is denormalised alongside the foreign key on purpose: an account
 * can be removed from the whitelist, and the record of what it did must
 * outlive it. For the same reason `applicationId` is a plain column - deleting
 * an application must not take its history with it.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    /** A key from `lib/audit/actions.ts`, e.g. `application.submitted`. */
    action: text("action").notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    /** What was acted on: `user`, `role`, `application`, `workflow`, ... */
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** Human-readable name of the target as it was at the time. */
    targetLabel: text("target_label"),
    applicationId: text("application_id"),
    /** One line describing the event, ready to show in the table. */
    summary: text("summary").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_actor_id_idx").on(table.actorId),
    index("audit_log_application_id_idx").on(table.applicationId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  roles: many(userRole),
  applications: many(application),
  school: one(school, { fields: [user.schoolId], references: [school.id] }),
}));

export const schoolRelations = relations(school, ({ one, many }) => ({
  dean: one(user, { fields: [school.deanId], references: [user.id] }),
  associateDeans: many(schoolAssociateDean),
  members: many(user),
}));

export const schoolAssociateDeanRelations = relations(
  schoolAssociateDean,
  ({ one }) => ({
    school: one(school, {
      fields: [schoolAssociateDean.schoolId],
      references: [school.id],
    }),
    user: one(user, {
      fields: [schoolAssociateDean.userId],
      references: [user.id],
    }),
  }),
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const roleRelations = relations(role, ({ many }) => ({
  users: many(userRole),
}));

export const userRoleRelations = relations(userRole, ({ one }) => ({
  user: one(user, { fields: [userRole.userId], references: [user.id] }),
  role: one(role, { fields: [userRole.roleId], references: [role.id] }),
}));

export const applicationRelations = relations(application, ({ one, many }) => ({
  applicant: one(user, {
    fields: [application.applicantId],
    references: [user.id],
  }),
  events: many(applicationEvent),
  files: many(applicationFile),
}));

export const applicationEventRelations = relations(
  applicationEvent,
  ({ one }) => ({
    application: one(application, {
      fields: [applicationEvent.applicationId],
      references: [application.id],
    }),
    actor: one(user, {
      fields: [applicationEvent.actorId],
      references: [user.id],
    }),
  }),
);

export const applicationFileRelations = relations(
  applicationFile,
  ({ one }) => ({
    application: one(application, {
      fields: [applicationFile.applicationId],
      references: [application.id],
    }),
    uploader: one(user, {
      fields: [applicationFile.uploadedBy],
      references: [user.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type User = typeof user.$inferSelect;
export type School = typeof school.$inferSelect;
export type Role = typeof role.$inferSelect;
export type Workflow = typeof workflow.$inferSelect;
export type WorkflowVersion = typeof workflowVersion.$inferSelect;
export type EmailTemplate = typeof emailTemplate.$inferSelect;
export type Application = typeof application.$inferSelect;
export type ApplicationEvent = typeof applicationEvent.$inferSelect;
export type ApplicationFile = typeof applicationFile.$inferSelect;
export type StageDraft = typeof stageDraft.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
