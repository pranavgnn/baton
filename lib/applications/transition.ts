import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  application,
  applicationEvent,
  user,
  type Application,
  type ApplicationStatus,
} from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit/record";
import { portalUrl } from "@/lib/mail/system";
import { publishEmailJobs, type EmailJob } from "@/lib/mail/queue";
import { classifyDestination, resolveTransition } from "@/lib/workflow/engine";
import { nodeById } from "@/lib/workflow/graph";
import {
  type EmailNode,
  type SectionData,
  type TemplateVariables,
  type WorkflowNode,
} from "@/lib/workflow/types";
import {
  holdersOfRole,
  holdersOfRoleInDepartment,
} from "@/lib/departments/query";
import { emailsForRole } from "./service";

/* -------------------------------------------------------------------------- */
/*  Template variables                                                         */
/* -------------------------------------------------------------------------- */

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export type VariableContext = {
  app: Application;
  applicantName: string;
  applicantEmail: string;
  destination: WorkflowNode;
  previousNode: WorkflowNode | null;
  outcomeLabel: string | null;
  actorName: string | null;
  status: ApplicationStatus;
};

export function buildVariables(context: VariableContext): TemplateVariables {
  return {
    applicant_name: context.applicantName,
    applicant_email: context.applicantEmail,
    application_reference: context.app.reference,
    application_status: humanStatus(context.status),
    current_stage: context.destination.data.label,
    previous_stage: context.previousNode?.data.label ?? "",
    last_outcome: context.outcomeLabel ?? "",
    actor_name: context.actorName ?? "",
    submitted_at: context.app.submittedAt
      ? dateFormatter.format(context.app.submittedAt)
      : dateFormatter.format(new Date()),
    application_url: portalUrl(`/applications/${context.app.id}`),
  };
}

export function humanStatus(status: ApplicationStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "in_progress":
      return "In progress";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
  }
}

/* -------------------------------------------------------------------------- */
/*  Email dispatch                                                             */
/* -------------------------------------------------------------------------- */

/** Who an email step is about, beyond the message itself. */
type Audience = {
  applicantEmail: string;
  /** The department the application concerns, for a department-scoped message. */
  applicantDepartmentId: string | null;
  /** The person the application has just been handed to, if anyone. */
  assignee: { id: string; name: string } | null;
};

/**
 * The addresses one email step resolves to.
 *
 * A role is institute-wide but a notification rarely is: "tell the head" means
 * the head of the applicant's department, and "tell the deputy" means the
 * one the file was just handed to. Both are the step's own setting rather than
 * anything inferred from the role, so an institute that organises itself
 * differently configures it differently.
 */
async function resolveRecipients(
  node: EmailNode,
  audience: Audience,
): Promise<string[]> {
  switch (node.data.recipientMode) {
    case "applicant":
      return [audience.applicantEmail];
    case "custom":
      return node.data.recipientEmail ? [node.data.recipientEmail.trim()] : [];
    case "role": {
      const roleId = node.data.recipientRoleId;
      if (!roleId) return [];

      // Snapshots taken before scopes existed carry none, and meant the role.
      switch (node.data.recipientScope) {
        case "applicant_department": {
          const people = await holdersOfRoleInDepartment(
            roleId,
            audience.applicantDepartmentId,
          );
          return people.map((person) => person.email);
        }
        case "assigned_person": {
          if (!audience.assignee) return [];
          const holders = await holdersOfRole(roleId);
          return holders
            .filter((person) => person.id === audience.assignee?.id)
            .map((person) => person.email);
        }
        default:
          return emailsForRole(roleId);
      }
    }
  }
}

export type EmailDispatchRecord = {
  nodeId: string;
  nodeLabel: string;
  recipients: string[];
  /** Whether the job reached the queue - not whether the mail was delivered. */
  ok: boolean;
  error?: string;
};

/**
 * Turns the email nodes hanging off a handle into queue jobs and publishes
 * them.
 *
 * Nothing here waits on SMTP: the worker renders and sends. A node that cannot
 * produce a job (no template, no recipients) and a broker that will not take
 * the message are both recorded against the application rather than allowed to
 * strand it mid-workflow.
 */
async function queueEmails(
  applicationId: string,
  nodes: EmailNode[],
  variables: TemplateVariables,
  audience: Audience,
): Promise<EmailDispatchRecord[]> {
  const records: EmailDispatchRecord[] = [];
  const jobs: EmailJob[] = [];

  for (const node of nodes) {
    const label = node.data.label;

    if (!node.data.templateId) {
      records.push({
        nodeId: node.id,
        nodeLabel: label,
        recipients: [],
        ok: false,
        error: "No template configured on this email step.",
      });
      continue;
    }

    const recipients = await resolveRecipients(node, audience);
    if (recipients.length === 0) {
      records.push({
        nodeId: node.id,
        nodeLabel: label,
        recipients: [],
        ok: false,
        error: "No recipients resolved for this email step.",
      });
      continue;
    }

    jobs.push({
      id: crypto.randomUUID(),
      applicationId,
      nodeId: node.id,
      nodeLabel: label,
      templateId: node.data.templateId,
      recipients,
      variables: variables as Record<string, string>,
    });
    records.push({ nodeId: node.id, nodeLabel: label, recipients, ok: true });
  }

  if (jobs.length === 0) return records;

  const published = await publishEmailJobs(jobs);
  if (published.ok) return records;

  // The broker refused the batch; mark every job in it as unqueued.
  const failed = new Set(jobs.map((job) => job.nodeId));
  return records.map((record) =>
    failed.has(record.nodeId)
      ? { ...record, ok: false, error: `Could not queue: ${published.error}` }
      : record,
  );
}

/* -------------------------------------------------------------------------- */
/*  Transitions                                                                */
/* -------------------------------------------------------------------------- */

export type TransitionResult =
  | {
      ok: true;
      status: ApplicationStatus;
      currentNodeId: string;
      destinationLabel: string;
      emails: EmailDispatchRecord[];
    }
  | { ok: false; error: string };

type AdvanceInput = {
  app: Application;
  fromNodeId: string;
  handleId: string;
  outcomeLabel: string | null;
  actor: { id: string; name: string } | null;
  /** Data to merge into the namespace of `fromNodeId` before advancing. */
  namespaceData?: { namespace: string; data: SectionData };
  eventType: "submitted" | "stage_completed";
  note?: string;
  /**
   * Who the next stage is held for. Set when the stage just completed
   * nominates its successor; otherwise the next stage is open to everyone
   * holding its role.
   */
  nominee?: { id: string; name: string } | null;
};

/**
 * Single code path for every forward move: applicant submission and reviewer
 * sign-off both land here so email side effects and timeline records stay
 * consistent.
 */
export async function advanceApplication(
  input: AdvanceInput,
): Promise<TransitionResult> {
  const { app, fromNodeId, handleId } = input;
  const graph = app.graph;

  const resolved = resolveTransition(graph, fromNodeId, handleId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const previousNode = nodeById(graph, fromNodeId) ?? null;
  const outcome = classifyDestination(resolved.destination);

  const status: ApplicationStatus =
    outcome.kind === "finished"
      ? outcome.result
      : outcome.kind === "returned_to_applicant"
        ? "draft"
        : "in_progress";

  const applicant = await db.query.user.findFirst({
    where: eq(user.id, app.applicantId),
  });
  if (!applicant)
    return { ok: false, error: "The applicant no longer exists." };

  const mergedData = input.namespaceData
    ? {
        ...app.data,
        [input.namespaceData.namespace]: {
          ...(app.data?.[input.namespaceData.namespace] ?? {}),
          ...input.namespaceData.data,
        },
      }
    : app.data;

  const now = new Date();
  const updated = await db
    .update(application)
    .set({
      data: mergedData,
      status,
      currentNodeId: resolved.destination.id,
      submittedAt:
        input.eventType === "submitted" ? now : (app.submittedAt ?? now),
      completedAt: outcome.kind === "finished" ? now : null,
      // Cleared unless this move nominates someone: an assignment belongs to
      // the stage it was made for, not to the application for ever.
      assignedToId: input.nominee?.id ?? null,
    })
    .where(eq(application.id, app.id))
    .returning();

  const nextApp = updated[0] ?? app;

  await db.insert(applicationEvent).values({
    id: crypto.randomUUID(),
    applicationId: app.id,
    type: input.eventType,
    nodeId: fromNodeId,
    nodeLabel: previousNode?.data.label ?? null,
    outcomeId: handleId,
    outcomeLabel: input.outcomeLabel,
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    note: input.nominee
      ? `${input.note ?? ""} Sent to ${input.nominee.name}.`.trim()
      : (input.note ?? null),
    detail: {
      destinationId: resolved.destination.id,
      ...(input.nominee ? { nomineeId: input.nominee.id } : {}),
    },
  });

  const variables = buildVariables({
    app: nextApp,
    applicantName: applicant.name,
    applicantEmail: applicant.email,
    destination: resolved.destination,
    previousNode,
    outcomeLabel: input.outcomeLabel,
    actorName: input.actor?.name ?? null,
    status,
  });

  const emails = await queueEmails(app.id, resolved.emails, variables, {
    applicantEmail: applicant.email,
    applicantDepartmentId: applicant.departmentId,
    assignee: input.nominee ?? null,
  });

  for (const record of emails) {
    await db.insert(applicationEvent).values({
      id: crypto.randomUUID(),
      applicationId: app.id,
      type: "email_queued",
      nodeId: record.nodeId,
      nodeLabel: record.nodeLabel,
      actorId: null,
      actorName: null,
      note: record.ok
        ? `Queued for ${record.recipients.join(", ")}`
        : `Could not queue: ${record.error}`,
      detail: { recipients: record.recipients, ok: record.ok },
    });

    // Recorded against the person whose action set it off, but as the
    // portal's own doing: nobody chose the recipients, the step did.
    await recordAudit({
      action: record.ok
        ? "application.email_dispatched"
        : "application.email_failed",
      summary: record.ok
        ? `Dispatched "${record.nodeLabel}" for ${nextApp.reference} to ${record.recipients.join(", ")}.`
        : `Could not dispatch "${record.nodeLabel}" for ${nextApp.reference}: ${record.error}`,
      targetType: "application",
      targetId: app.id,
      targetLabel: nextApp.reference,
      applicationId: app.id,
      detail: {
        step: record.nodeLabel,
        recipients: record.recipients,
        triggeredBy: input.actor?.name ?? "the applicant",
      },
    });
  }

  if (outcome.kind === "finished") {
    await db.insert(applicationEvent).values({
      id: crypto.randomUUID(),
      applicationId: app.id,
      type: "completed",
      nodeId: resolved.destination.id,
      nodeLabel: resolved.destination.data.label,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      note: `Application ${humanStatus(status).toLowerCase()}.`,
      detail: {},
    });
  }

  if (outcome.kind === "returned_to_applicant") {
    await db.insert(applicationEvent).values({
      id: crypto.randomUUID(),
      applicationId: app.id,
      type: "reopened",
      nodeId: resolved.destination.id,
      nodeLabel: resolved.destination.data.label,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      note: "Returned to the applicant for changes.",
      detail: {},
    });
  }

  return {
    ok: true,
    status,
    currentNodeId: resolved.destination.id,
    destinationLabel: resolved.destination.data.label,
    emails,
  };
}
