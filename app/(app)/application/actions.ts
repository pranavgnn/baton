"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { fail, failFrom, ok, type ActionResult } from "@/lib/actions";
import {
  getOpenApplicationFor,
  getPublishedWorkflow,
  nextReference,
} from "@/lib/applications/service";
import { advanceApplication } from "@/lib/applications/transition";
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  application,
  applicationEvent,
  applicationFile,
} from "@/lib/db/schema";
import { collectFiles, pruneToSchema, validateForm } from "@/lib/workflow/form";
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
    await db.insert(application).values({
      id,
      reference: await nextReference(),
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

    revalidatePath("/application");
    return ok({ id });
  } catch (error) {
    return failFrom(error);
  }
}

async function loadOwnDraft(userId: string) {
  const app = await getOpenApplicationFor(userId);
  if (!app) return { error: "You do not have an application in progress." };
  if (app.applicantId !== userId) return { error: "Not your application." };
  if (app.status !== "draft") {
    return { error: "This application has already been submitted." };
  }
  return { app };
}

export async function saveApplicationDraft(
  data: SectionData,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("applications.apply");
    const loaded = await loadOwnDraft(current.id);
    if (loaded.error) return fail(loaded.error);

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

    const app = loaded.app!;
    const start = startNode(app.graph);
    if (!start) return fail("The workflow has no submission step.");

    const pruned = pruneToSchema(start.data.form, data);
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
