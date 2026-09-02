"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { fail, failFrom, ok, type ActionResult } from "@/lib/actions";
import {
  canActOnCurrentStage,
  getApplicationById,
  type ApplicationWithApplicant,
} from "@/lib/applications/service";
import { advanceApplication } from "@/lib/applications/transition";
import { recordAudit } from "@/lib/audit/record";
import { requirePermissionAction, type CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { stageDraft } from "@/lib/db/schema";
import {
  associateDeansOfSchool,
  holdersOfRole,
  usersHoldingRole,
  type SchoolPerson,
} from "@/lib/schools/query";
import { pruneToSchema, validateForm } from "@/lib/workflow/form";
import { nodeById, nominatedTarget } from "@/lib/workflow/graph";
import { type SectionData, type StageNode } from "@/lib/workflow/types";

type LoadedStage =
  | { ok: false; error: string }
  | { ok: true; app: ApplicationWithApplicant; node: StageNode };

/**
 * Resolves the stage the viewer is allowed to act on right now. Authorisation
 * is re-checked here rather than trusted from the page, because another holder
 * of the same role may have advanced the application in the meantime.
 */
async function loadActionableStage(
  applicationId: string,
  current: CurrentUser,
): Promise<LoadedStage> {
  const app = await getApplicationById(applicationId);
  if (!app) return { ok: false, error: "That application no longer exists." };

  if (!canActOnCurrentStage(app, current)) {
    return {
      ok: false,
      error:
        "This application is no longer waiting on your role. Someone else may have acted on it.",
    };
  }

  const node = nodeById(app.graph, app.currentNodeId);
  if (!node || node.kind !== "stage") {
    return { ok: false, error: "The current step is not a review stage." };
  }

  return { ok: true, app, node };
}

/**
 * Who this outcome may hand the application to, or null when it goes to a
 * whole role rather than to a person.
 *
 * The candidates come from the stage being entered - its pool and its role -
 * so nothing here depends on what the browser sent, and an outcome that leads
 * to an ordinary stage asks for nobody.
 */
export async function nomineesFor(
  app: ApplicationWithApplicant,
  node: StageNode,
  outcomeId: string,
): Promise<SchoolPerson[] | null> {
  const target = nominatedTarget(app.graph, node.id, outcomeId);
  if (!target || !target.data.roleId) return null;

  if (target.data.assignment.pool === "school_associate_deans") {
    if (!app.applicant.schoolId) return [];

    // Narrowed to those who actually hold the stage's role: anyone else would
    // be handed a file they cannot open.
    const candidates = await associateDeansOfSchool(app.applicant.schoolId);
    if (candidates.length === 0) return [];

    const holders = await usersHoldingRole(
      target.data.roleId,
      candidates.map((person) => person.id),
    );
    return candidates.filter((person) => holders.has(person.id));
  }

  return holdersOfRole(target.data.roleId);
}

/** Every outcome of a stage, with who it may be addressed to. */
export async function nomineesByOutcome(
  app: ApplicationWithApplicant,
  node: StageNode,
): Promise<Record<string, SchoolPerson[] | null>> {
  const entries = await Promise.all(
    node.data.outcomes.map(
      async (outcome) =>
        [outcome.id, await nomineesFor(app, node, outcome.id)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

/** Per-reviewer draft so two holders of a role never overwrite each other. */
export async function saveStageDraft(
  applicationId: string,
  data: SectionData,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("applications.review");
    const loaded = await loadActionableStage(applicationId, current);
    if (!loaded.ok) return fail(loaded.error);

    const pruned = pruneToSchema(loaded.node.data.form, data);

    const existing = await db.query.stageDraft.findFirst({
      where: and(
        eq(stageDraft.applicationId, applicationId),
        eq(stageDraft.nodeId, loaded.node.id),
        eq(stageDraft.userId, current.id),
      ),
    });

    if (existing) {
      await db
        .update(stageDraft)
        .set({ data: pruned })
        .where(eq(stageDraft.id, existing.id));
    } else {
      await db.insert(stageDraft).values({
        id: crypto.randomUUID(),
        applicationId,
        nodeId: loaded.node.id,
        userId: current.id,
        data: pruned,
      });
    }

    await recordAudit({
      action: "application.stage_draft_saved",
      actor: current,
      summary: `Saved review notes on ${loaded.app.reference} at ${loaded.node.data.label}.`,
      targetType: "application",
      targetId: applicationId,
      targetLabel: loaded.app.reference,
      applicationId,
      detail: { stage: loaded.node.data.label },
    });

    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function clearStageDraft(
  applicationId: string,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("applications.review");
    const loaded = await loadActionableStage(applicationId, current);
    if (!loaded.ok) return fail(loaded.error);

    await db
      .delete(stageDraft)
      .where(
        and(
          eq(stageDraft.applicationId, applicationId),
          eq(stageDraft.nodeId, loaded.node.id),
          eq(stageDraft.userId, current.id),
        ),
      );

    revalidatePath(`/reviews/${applicationId}`);
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function completeStage(
  applicationId: string,
  outcomeId: string,
  data: SectionData,
  nomineeId?: string | null,
): Promise<ActionResult<{ status: string; destination: string }>> {
  try {
    const current = await requirePermissionAction("applications.review");
    const loaded = await loadActionableStage(applicationId, current);
    if (!loaded.ok) return fail(loaded.error);

    const { app, node } = loaded;
    const outcome = node.data.outcomes.find((entry) => entry.id === outcomeId);
    if (!outcome) return fail("That outcome is not available on this stage.");

    /**
     * Re-derived rather than trusted: the browser sends an id, and the only
     * ids this stage may hand the application to are the ones resolved here
     * from the applicant's own school.
     */
    let nominee: { id: string; name: string } | null = null;
    const candidates = await nomineesFor(app, node, outcome.id);
    if (candidates) {
      const target = nominatedTarget(app.graph, node.id, outcome.id);
      if (candidates.length === 0) {
        return fail(
          `Nobody can take ${target?.data.label ?? "the next step"} for this application. Ask an administrator to appoint someone.`,
        );
      }

      const chosen = candidates.find((entry) => entry.id === nomineeId);
      if (!chosen) {
        return fail("Choose who this goes to.");
      }
      nominee = { id: chosen.id, name: chosen.name };
    }

    const pruned = pruneToSchema(node.data.form, data);

    // Outcomes such as "Send back" can be configured to skip the form so a
    // reviewer is not forced to score an application they are returning.
    let payload: SectionData = pruned;
    if (outcome.requiresForm) {
      const validation = validateForm(node.data.form, pruned);
      if (!validation.ok) {
        return fail(
          "Complete the review form before choosing this outcome.",
          validation.errors,
        );
      }
      payload = validation.data;
    }

    const result = await advanceApplication({
      app,
      fromNodeId: node.id,
      handleId: outcome.id,
      outcomeLabel: outcome.label,
      actor: { id: current.id, name: current.name },
      namespaceData: { namespace: node.id, data: payload },
      eventType: "stage_completed",
      note: `${node.data.label} completed with outcome "${outcome.label}".`,
      nominee,
    });

    if (!result.ok) return fail(result.error);

    await recordAudit({
      action: "application.reviewed",
      actor: current,
      summary: `Completed ${node.data.label} on ${app.reference} with outcome "${outcome.label}".`,
      targetType: "application",
      targetId: applicationId,
      targetLabel: app.reference,
      applicationId,
      detail: {
        stage: node.data.label,
        outcome: outcome.label,
        status: result.status,
        destination: result.destinationLabel,
      },
    });

    // The stage is done; the per-reviewer scratch copy is no longer needed.
    await db
      .delete(stageDraft)
      .where(
        and(
          eq(stageDraft.applicationId, applicationId),
          eq(stageDraft.nodeId, node.id),
        ),
      );

    revalidatePath("/reviews");
    revalidatePath(`/reviews/${applicationId}`);
    revalidatePath("/applications");
    revalidatePath("/dashboard");
    return ok({ status: result.status, destination: result.destinationLabel });
  } catch (error) {
    return failFrom(error);
  }
}
