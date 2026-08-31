import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  application,
  applicationEvent,
  emailTemplate,
  user,
  type Application,
  type ApplicationStatus,
} from "@/lib/db/schema";
import { renderTemplate } from "@/lib/mail/render";
import { portalUrl } from "@/lib/mail/system";
import { sendMail } from "@/lib/mail/transport";
import { classifyDestination, resolveTransition } from "@/lib/workflow/engine";
import { nodeById } from "@/lib/workflow/graph";
import {
  type EmailNode,
  type SectionData,
  type TemplateVariables,
  type WorkflowNode,
} from "@/lib/workflow/types";
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
    portal_url: portalUrl("/dashboard"),
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

async function resolveRecipients(
  node: EmailNode,
  applicantEmail: string,
): Promise<string[]> {
  switch (node.data.recipientMode) {
    case "applicant":
      return [applicantEmail];
    case "custom":
      return node.data.recipientEmail ? [node.data.recipientEmail.trim()] : [];
    case "role":
      return node.data.recipientRoleId
        ? emailsForRole(node.data.recipientRoleId)
        : [];
  }
}

export type EmailDispatchRecord = {
  nodeId: string;
  nodeLabel: string;
  recipients: string[];
  ok: boolean;
  error?: string;
};

/**
 * Fires every Email node passed on the way to the destination. Delivery
 * failures are recorded on the timeline but never block the transition - a
 * down mail server must not strand an application mid-graph.
 */
async function dispatchEmails(
  nodes: EmailNode[],
  variables: TemplateVariables,
  applicantEmail: string,
): Promise<EmailDispatchRecord[]> {
  const records: EmailDispatchRecord[] = [];

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

    const template = await db.query.emailTemplate.findFirst({
      where: eq(emailTemplate.id, node.data.templateId),
    });
    if (!template) {
      records.push({
        nodeId: node.id,
        nodeLabel: label,
        recipients: [],
        ok: false,
        error: "The configured template no longer exists.",
      });
      continue;
    }

    const recipients = await resolveRecipients(node, applicantEmail);
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

    const rendered = await renderTemplate({
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      variables,
    });

    const result = await sendMail({
      to: recipients,
      subject: rendered.subject,
      html: rendered.html,
    });

    records.push({
      nodeId: node.id,
      nodeLabel: label,
      recipients,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
    });
  }

  return records;
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
    note: input.note ?? null,
    detail: { destinationId: resolved.destination.id },
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

  const emails = await dispatchEmails(
    resolved.emails,
    variables,
    applicant.email,
  );

  for (const record of emails) {
    await db.insert(applicationEvent).values({
      id: crypto.randomUUID(),
      applicationId: app.id,
      type: "email_sent",
      nodeId: record.nodeId,
      nodeLabel: record.nodeLabel,
      actorId: null,
      actorName: null,
      note: record.ok
        ? `Sent to ${record.recipients.join(", ")}`
        : `Delivery failed: ${record.error}`,
      detail: { recipients: record.recipients, ok: record.ok },
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
