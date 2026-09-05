import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  application,
  applicationEvent,
  applicationFile,
  role,
  school,
  stageDraft,
  user,
  userRole,
  workflow,
  type Application,
  type ApplicationStatus,
} from "@/lib/db/schema";
import {
  nodeById,
  startNode,
  stageNodes,
  withinStageAudience,
} from "@/lib/workflow/graph";
import { pruneToSchema } from "@/lib/workflow/form";
import { SINGLETON_WORKFLOW_ID } from "@/lib/workflow/defaults";
import {
  APPLICANT_NAMESPACE,
  type ApplicationData,
  type WorkflowGraph,
} from "@/lib/workflow/types";
import type { CurrentUser } from "@/lib/auth/session";

/* -------------------------------------------------------------------------- */
/*  Workflow access                                                            */
/* -------------------------------------------------------------------------- */

export async function getWorkflow() {
  return db.query.workflow.findFirst({
    where: eq(workflow.id, SINGLETON_WORKFLOW_ID),
  });
}

export type PublishedWorkflow = {
  graph: WorkflowGraph;
  version: number;
  acceptingApplications: boolean;
};

export async function getPublishedWorkflow(): Promise<PublishedWorkflow | null> {
  const row = await getWorkflow();
  if (!row?.publishedGraph) return null;
  return {
    graph: row.publishedGraph,
    version: row.version,
    acceptingApplications: row.acceptingApplications,
  };
}

/* -------------------------------------------------------------------------- */
/*  Reference numbers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Human-readable identifier of the form PROM-2026-0042. Generated from a count
 * and retried by the caller on the unique-constraint violation, which is rare
 * enough that a dedicated sequence would be over-engineering.
 */
export async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await db
    .select({ total: count() })
    .from(application)
    .where(sql`${application.reference} LIKE ${`PROM-${year}-%`}`);

  const sequence = (row?.total ?? 0) + 1;
  return `PROM-${year}-${String(sequence).padStart(4, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  Applicant-facing queries                                                   */
/* -------------------------------------------------------------------------- */

export type ApplicationWithApplicant = Application & {
  applicant: {
    id: string;
    name: string;
    email: string;
    schoolId: string | null;
    school: string | null;
    designation: string | null;
  };
};

/**
 * The application an applicant is currently working on or tracking. A user has
 * at most one open application; completed ones stay readable in their history.
 */
export async function getOpenApplicationFor(
  userId: string,
): Promise<Application | null> {
  const rows = await db
    .select()
    .from(application)
    .where(
      and(
        eq(application.applicantId, userId),
        inArray(application.status, ["draft", "in_progress"]),
      ),
    )
    .orderBy(desc(application.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Brings a not-yet-submitted draft onto the current published workflow.
 *
 * Snapshotting the graph is what protects an application already moving
 * through the process - but a draft has not entered it yet, so leaving it on
 * an old snapshot means the applicant fills in questions the institute has
 * since changed. Answers to fields that still exist are kept; answers to
 * fields that were removed are dropped, because they no longer have anywhere
 * to live.
 *
 * Returns the application as it should now be read.
 */
export async function refreshDraftToPublished(
  app: Application,
): Promise<Application> {
  if (app.status !== "draft") return app;

  const published = await getPublishedWorkflow();
  if (!published) return app;
  if (published.version === app.workflowVersion) return app;

  const start = startNode(published.graph);
  if (!start) return app;

  const pruned = pruneToSchema(
    start.data.form,
    app.data?.[APPLICANT_NAMESPACE] ?? null,
  );

  const [updated] = await db
    .update(application)
    .set({
      graph: published.graph,
      workflowVersion: published.version,
      currentNodeId: start.id,
      data: { ...app.data, [APPLICANT_NAMESPACE]: pruned },
    })
    .where(eq(application.id, app.id))
    .returning();

  return updated ?? app;
}

export async function listApplicationsFor(
  userId: string,
): Promise<Application[]> {
  return db
    .select()
    .from(application)
    .where(eq(application.applicantId, userId))
    .orderBy(desc(application.createdAt));
}

export async function getApplicationById(
  id: string,
): Promise<ApplicationWithApplicant | null> {
  const rows = await db
    .select({
      application,
      applicantId: user.id,
      applicantName: user.name,
      applicantEmail: user.email,
      applicantSchoolId: user.schoolId,
      applicantSchool: school.name,
      applicantDesignation: user.designation,
    })
    .from(application)
    .innerJoin(user, eq(user.id, application.applicantId))
    .leftJoin(school, eq(school.id, user.schoolId))
    .where(eq(application.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row.application,
    applicant: {
      id: row.applicantId,
      name: row.applicantName,
      email: row.applicantEmail,
      schoolId: row.applicantSchoolId,
      school: row.applicantSchool,
      designation: row.applicantDesignation,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Reviewer queue                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Applications parked on a stage node assigned to one of the viewer's roles.
 * Every holder of the role sees the same queue and the first to act advances
 * the application.
 */
export async function getReviewQueue(
  current: CurrentUser,
): Promise<ApplicationWithApplicant[]> {
  if (current.roleIds.length === 0) return [];

  const published = await getPublishedWorkflow();
  const rows = await db
    .select({
      application,
      applicantId: user.id,
      applicantName: user.name,
      applicantEmail: user.email,
      applicantSchoolId: user.schoolId,
      applicantSchool: school.name,
      applicantDesignation: user.designation,
    })
    .from(application)
    .innerJoin(user, eq(user.id, application.applicantId))
    .leftJoin(school, eq(school.id, user.schoolId))
    .where(eq(application.status, "in_progress"))
    .orderBy(desc(application.submittedAt));

  const queue: ApplicationWithApplicant[] = [];
  for (const row of rows) {
    // Each application carries its own graph snapshot, so authorisation is
    // resolved against the graph it was submitted under, not the live one.
    const graph = row.application.graph ?? published?.graph;
    if (!graph) continue;

    const app: ApplicationWithApplicant = {
      ...row.application,
      graph,
      applicant: {
        id: row.applicantId,
        name: row.applicantName,
        email: row.applicantEmail,
        schoolId: row.applicantSchoolId,
        school: row.applicantSchool,
        designation: row.applicantDesignation,
      },
    };

    // One rule for the queue and for the action, so what a reviewer is shown
    // and what they are allowed to do cannot drift apart.
    if (canActOnCurrentStage(app, current)) queue.push(app);
  }

  return queue;
}

/**
 * What a stage needs to know about the application to decide who may take it:
 * where it is, whether it is held for someone, and which school it concerns.
 */
export type StageAccessInput = Pick<
  Application,
  "graph" | "currentNodeId" | "status" | "assignedToId"
> & { applicant: { schoolId: string | null } };

/**
 * One review this person signed off, most recent first.
 *
 * Keyed on who actually acted rather than on which role they hold: a reviewer
 * asking "what have I decided" means the decisions they took, not everything
 * their role has ever seen. A stage a person takes twice - the dean, who
 * delegates and then decides - is two entries, because it was two decisions.
 */
export type CompletedReview = {
  eventId: string;
  applicationId: string;
  reference: string;
  applicantName: string;
  applicantEmail: string;
  school: string | null;
  status: ApplicationStatus;
  stageLabel: string | null;
  outcomeLabel: string | null;
  reviewedAt: Date;
};

export async function listReviewsBy(
  userId: string,
): Promise<CompletedReview[]> {
  const rows = await db
    .select({
      eventId: applicationEvent.id,
      applicationId: application.id,
      reference: application.reference,
      status: application.status,
      stageLabel: applicationEvent.nodeLabel,
      outcomeLabel: applicationEvent.outcomeLabel,
      reviewedAt: applicationEvent.createdAt,
      applicantName: user.name,
      applicantEmail: user.email,
      school: school.name,
    })
    .from(applicationEvent)
    .innerJoin(application, eq(application.id, applicationEvent.applicationId))
    .innerJoin(user, eq(user.id, application.applicantId))
    .leftJoin(school, eq(school.id, user.schoolId))
    .where(
      and(
        eq(applicationEvent.actorId, userId),
        eq(applicationEvent.type, "stage_completed"),
      ),
    )
    .orderBy(desc(applicationEvent.createdAt));

  return rows;
}

/** True when the viewer may act on the application's current stage. */
export function canActOnCurrentStage(
  app: StageAccessInput,
  current: CurrentUser,
): boolean {
  if (app.status !== "in_progress") return false;
  const node = nodeById(app.graph, app.currentNodeId);
  if (!node || node.kind !== "stage" || !node.data.roleId) return false;
  if (!current.roleIds.includes(node.data.roleId)) return false;
  // A stage scoped to the applicant's school belongs to that school's holders
  // of the role, not to everyone who holds it.
  const inAudience = withinStageAudience(node.data.assignment, {
    applicantSchoolId: app.applicant.schoolId,
    viewerSchoolIds: current.schoolIds,
  });
  if (!inAudience) return false;
  // A stage nominated to one person is theirs alone until they act.
  return !app.assignedToId || app.assignedToId === current.id;
}

/** Read access: owner, any assigned reviewer, or a global viewer. */
export function canViewApplication(
  app: StageAccessInput & Pick<Application, "applicantId">,
  current: CurrentUser,
): boolean {
  if (app.applicantId === current.id) return true;
  if (current.isSuperAdmin) return true;
  if (current.permissions.includes("applications.viewAll")) return true;
  if (canActOnCurrentStage(app, current)) return true;

  // A reviewer who already acted keeps read access to what they signed off.
  const stages = stageNodes(app.graph);
  return stages.some(
    (node) =>
      node.data.roleId !== null &&
      current.roleIds.includes(node.data.roleId) &&
      Boolean((app as { data?: ApplicationData }).data?.[node.id]),
  );
}

/* -------------------------------------------------------------------------- */
/*  Listing / dashboard                                                        */
/* -------------------------------------------------------------------------- */

export async function listAllApplications(): Promise<
  ApplicationWithApplicant[]
> {
  const rows = await db
    .select({
      application,
      applicantId: user.id,
      applicantName: user.name,
      applicantEmail: user.email,
      applicantSchoolId: user.schoolId,
      applicantSchool: school.name,
      applicantDesignation: user.designation,
    })
    .from(application)
    .innerJoin(user, eq(user.id, application.applicantId))
    .leftJoin(school, eq(school.id, user.schoolId))
    .orderBy(desc(application.createdAt));

  return rows.map((row) => ({
    ...row.application,
    applicant: {
      id: row.applicantId,
      name: row.applicantName,
      email: row.applicantEmail,
      schoolId: row.applicantSchoolId,
      school: row.applicantSchool,
      designation: row.applicantDesignation,
    },
  }));
}

export type StatusCounts = Record<ApplicationStatus, number>;

export async function countApplicationsByStatus(): Promise<StatusCounts> {
  const rows = await db
    .select({ status: application.status, total: count() })
    .from(application)
    .groupBy(application.status);

  const counts: StatusCounts = {
    draft: 0,
    in_progress: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

/* -------------------------------------------------------------------------- */
/*  Timeline / drafts / files                                                  */
/* -------------------------------------------------------------------------- */

export async function getTimeline(applicationId: string) {
  return db
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, applicationId))
    .orderBy(applicationEvent.createdAt);
}

export async function getStageDraft(
  applicationId: string,
  nodeId: string,
  userId: string,
) {
  return db.query.stageDraft.findFirst({
    where: and(
      eq(stageDraft.applicationId, applicationId),
      eq(stageDraft.nodeId, nodeId),
      eq(stageDraft.userId, userId),
    ),
  });
}

export async function getApplicationFiles(applicationId: string) {
  return db
    .select()
    .from(applicationFile)
    .where(eq(applicationFile.applicationId, applicationId));
}

/* -------------------------------------------------------------------------- */
/*  Role helpers                                                               */
/* -------------------------------------------------------------------------- */

export async function listRoles() {
  return db.select().from(role).orderBy(role.name);
}

export async function emailsForRole(roleId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(userRole)
    .innerJoin(user, eq(user.id, userRole.userId))
    .where(and(eq(userRole.roleId, roleId), eq(user.disabled, false)));

  return rows.map((row) => row.email);
}
