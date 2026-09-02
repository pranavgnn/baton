"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { fail, failFrom, ok, type ActionResult } from "@/lib/actions";
import {
  getOpenApplicationFor,
  getPublishedWorkflow,
  nextReference,
  refreshDraftToPublished,
} from "@/lib/applications/service";
import { advanceApplication } from "@/lib/applications/transition";
import { recordAudit } from "@/lib/audit/record";
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  application,
  applicationEvent,
  applicationFile,
  user,
} from "@/lib/db/schema";
import { promotionBar } from "@/lib/users/profile";
import { applyCalculations, applyPrefill } from "@/lib/workflow/autofill";
import { collectFiles, pruneToSchema, validateForm } from "@/lib/workflow/form";
import { accountProfile } from "@/lib/users/account-profile";
import { startNode } from "@/lib/workflow/graph";
import {
  APPLICANT_NAMESPACE,
  DEFAULT_SOURCE_HANDLE,
  type SectionData,
} from "@/lib/workflow/types";

/**
 * Creates the application row the first time an applicant opens the form. The
 * published graph is snapshotted here so later admin edits cannot change the
 * questions or the route of an application already in flight.
 */
export async function startApplication(): Promise<
  ActionResult<{ id: string }>
> {
  try {
    const current = await requirePermissionAction("applications.apply");

    const existing = await getOpenApplicationFor(current.id);
    if (existing) return ok({ id: existing.id });

    const barred = await promotionBarFor(current.id);
    if (barred) return fail(barred);

    const published = await getPublishedWorkflow();
    if (!published) {
      return fail("No workflow has been published yet.");
    }
    if (!published.acceptingApplications) {
      return fail("Applications are not open at the moment.");
    }

    const start = startNode(published.graph);
    if (!start) {
      return fail("The published workflow has no submission step.");
    }

    const id = crypto.randomUUID();
    const reference = await nextReference();
    await db.insert(application).values({
      id,
      reference,
      applicantId: current.id,
      status: "draft",
      graph: published.graph,
      workflowVersion: published.version,
      currentNodeId: start.id,
      data: {},
    });

    await db.insert(applicationEvent).values({
      id: crypto.randomUUID(),
      applicationId: id,
      type: "created",
      nodeId: start.id,
      nodeLabel: start.data.label,
      actorId: current.id,
      actorName: current.name,
      note: "Application started.",
      detail: {},
    });

    await recordAudit({
      action: "application.created",
      actor: current,
      summary: `Started promotion application ${reference}.`,
      targetType: "application",
      targetId: id,
      targetLabel: reference,
      applicationId: id,
    });

    revalidatePath("/application");
    return ok({ id });
  } catch (error) {
    return failFrom(error);
  }
}

async function loadOwnDraft(userId: string) {
  const existing = await getOpenApplicationFor(userId);
  if (!existing) {
    return { error: "You do not have an application in progress." };
  }
  if (existing.applicantId !== userId)
    return { error: "Not your application." };
  if (existing.status !== "draft") {
    return { error: "This application has already been submitted." };
  }
  // Match the page: a draft is always worked on against the live workflow.
  return { app: await refreshDraftToPublished(existing) };
}

export async function saveApplicationDraft(
  data: SectionData,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("applications.apply");
    const loaded = await loadOwnDraft(current.id);
    if (loaded.error) return fail(loaded.error);

    // Checked again on the way out: employment can change between starting a
    // draft and sending it, and it is the sending that matters.
    const barred = await promotionBarFor(current.id);
    if (barred) return fail(barred);

    const app = loaded.app!;
    const start = startNode(app.graph);
    if (!start) return fail("The workflow has no submission step.");

    // Drafts are intentionally not validated - the point is to save whatever
    // has been typed so far. Unknown keys are dropped so a stale client cannot
    // grow the document with fields the form no longer has.
    const pruned = pruneToSchema(start.data.form, data);

    await db
      .update(application)
      .set({ data: { ...app.data, [APPLICANT_NAMESPACE]: pruned } })
      .where(eq(application.id, app.id));

    await attachFiles(
      app.id,
      collectFiles(start.data.form, pruned).map((f) => f.id),
    );

    await recordAudit({
      action: "application.draft_saved",
      actor: current,
      summary: `Saved a draft of application ${app.reference}.`,
      targetType: "application",
      targetId: app.id,
      targetLabel: app.reference,
      applicationId: app.id,
    });

    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function clearApplicationDraft(): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("applications.apply");
    const loaded = await loadOwnDraft(current.id);
    if (loaded.error) return fail(loaded.error);

    const app = loaded.app!;
    await db
      .update(application)
      .set({ data: { ...app.data, [APPLICANT_NAMESPACE]: {} } })
      .where(eq(application.id, app.id));

    await recordAudit({
      action: "application.draft_discarded",
      actor: current,
      summary: `Cleared the answers on application ${app.reference}.`,
      targetType: "application",
      targetId: app.id,
      targetLabel: app.reference,
      applicationId: app.id,
    });

    revalidatePath("/application");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function submitApplication(
  data: SectionData,
): Promise<ActionResult<{ status: string; destination: string }>> {
  try {
    const current = await requirePermissionAction("applications.apply");
    const loaded = await loadOwnDraft(current.id);
    if (loaded.error) return fail(loaded.error);

    // Checked again on the way out: employment can change between starting a
    // draft and sending it, and it is the sending that matters.
    const barred = await promotionBarFor(current.id);
    if (barred) return fail(barred);

    const app = loaded.app!;
    const start = startNode(app.graph);
    if (!start) return fail("The workflow has no submission step.");

    // Recomputed and re-prefilled rather than taken as sent: a total the
    // browser was talked into, or a locked answer edited on the way, is
    // overwritten here before anything is validated or stored.
    const pruned = applyCalculations(
      start.data.form,
      applyPrefill(
        start.data.form,
        pruneToSchema(start.data.form, data),
        await accountProfile(current.id),
      ),
    );
    const validation = validateForm(start.data.form, pruned);
    if (!validation.ok) {
      return fail(
        "Some answers are still missing or invalid.",
        validation.errors,
      );
    }

    await attachFiles(
      app.id,
      collectFiles(start.data.form, pruned).map((f) => f.id),
    );

    const result = await advanceApplication({
      app,
      fromNodeId: start.id,
      handleId: DEFAULT_SOURCE_HANDLE,
      outcomeLabel: null,
      actor: { id: current.id, name: current.name },
      namespaceData: { namespace: APPLICANT_NAMESPACE, data: validation.data },
      eventType: "submitted",
      note: "Application submitted by the applicant.",
    });

    if (!result.ok) return fail(result.error);

    await recordAudit({
      action: "application.submitted",
      actor: current,
      summary: `Submitted application ${app.reference}, now with ${result.destinationLabel}.`,
      targetType: "application",
      targetId: app.id,
      targetLabel: app.reference,
      applicationId: app.id,
      detail: { status: result.status, destination: result.destinationLabel },
    });

    revalidatePath("/application");
    revalidatePath("/dashboard");
    revalidatePath("/reviews");
    return ok({ status: result.status, destination: result.destinationLabel });
  } catch (error) {
    return failFrom(error);
  }
}

/** Binds uploaded objects to the application so access control can resolve. */
async function attachFiles(applicationId: string, fileIds: string[]) {
  if (fileIds.length === 0) return;
  await db
    .update(applicationFile)
    .set({ applicationId })
    .where(
      and(
        inArray(applicationFile.id, fileIds),
        eq(applicationFile.confirmed, true),
      ),
    );
}

/** The reason this account may not apply, if there is one. */
async function promotionBarFor(userId: string): Promise<string | null> {
  const row = await db
    .select({ userType: user.userType })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return promotionBar(row[0]?.userType);
}
