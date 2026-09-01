"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  fail,
  failFrom,
  ok,
  parseInput,
  type ActionResult,
} from "@/lib/actions";
import { recordAudit } from "@/lib/audit/record";
import { grants } from "@/lib/auth/permissions";
import {
  requireAnyPermissionAction,
  requirePermissionAction,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  emailTemplate,
  role,
  workflow,
  workflowVersion,
} from "@/lib/db/schema";
import { SINGLETON_WORKFLOW_ID } from "@/lib/workflow/defaults";
import {
  hasBlockingIssues,
  structureSignature,
  validateGraph,
} from "@/lib/workflow/graph";
import { workflowGraphSchema, type WorkflowGraph } from "@/lib/workflow/types";

const graphInput = z.object({ graph: workflowGraphSchema });
export type SaveWorkflowInput = z.input<typeof graphInput>;

const publishInput = z.object({
  graph: workflowGraphSchema,
  /** Free-text note describing the change; shown in the version history. */
  memo: z.string().trim().max(500).optional().default(""),
});
export type PublishWorkflowInput = z.input<typeof publishInput>;

async function validationContext() {
  const [roles, templates] = await Promise.all([
    db.select({ id: role.id }).from(role),
    db.select({ id: emailTemplate.id }).from(emailTemplate),
  ]);
  return {
    roleIds: roles.map((r) => r.id),
    templateIds: templates.map((t) => t.id),
  };
}

async function currentWorkflow() {
  return db.query.workflow.findFirst({
    where: eq(workflow.id, SINGLETON_WORKFLOW_ID),
  });
}

/** Saves the draft graph. Drafts are allowed to be invalid; publishing is not. */
export async function saveWorkflowDraft(
  input: SaveWorkflowInput,
): Promise<ActionResult<{ issues: number }>> {
  try {
    const current = await requireAnyPermissionAction([
      "workflow.manage",
      "forms.manage",
    ]);

    const parsed = parseInput(graphInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await currentWorkflow();

    // Re-checked here rather than trusted from the page: a form editor must
    // not be able to reshape the process by posting a different graph.
    if (!grants(current.permissions, "workflow.manage")) {
      if (!existing) {
        return fail("Only a workflow administrator can create the workflow.");
      }
      if (
        structureSignature(parsed.data.graph) !==
        structureSignature(existing.graph)
      ) {
        return fail(
          "You can edit the questions on a step, but not add, remove or rewire steps.",
        );
      }
    }

    if (existing) {
      await db
        .update(workflow)
        .set({ graph: parsed.data.graph })
        .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));
    } else {
      await db.insert(workflow).values({
        id: SINGLETON_WORKFLOW_ID,
        graph: parsed.data.graph,
        publishedGraph: null,
        version: 0,
        acceptingApplications: false,
      });
    }

    const issues = validateGraph(parsed.data.graph, await validationContext());

    await recordAudit({
      action: "workflow.draft_saved",
      actor: current,
      summary: "Saved the workflow draft.",
      targetType: "workflow",
      detail: {
        steps: parsed.data.graph.nodes.length,
        problems: issues.filter((i) => i.severity === "error").length,
      },
    });

    revalidatePath("/admin/workflow");
    revalidatePath("/admin");
    return ok({ issues: issues.filter((i) => i.severity === "error").length });
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * Promotes the draft to the published graph, bumps the version and records the
 * revision. In-flight applications are unaffected: each keeps the snapshot it
 * started with.
 */
export async function publishWorkflow(
  input: PublishWorkflowInput,
): Promise<ActionResult<{ version: number }>> {
  try {
    const current = await requirePermissionAction("workflow.manage");

    const parsed = parseInput(publishInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const issues = validateGraph(parsed.data.graph, await validationContext());
    if (hasBlockingIssues(issues)) {
      return fail(
        `Fix ${issues.filter((i) => i.severity === "error").length} problem(s) before publishing.`,
      );
    }

    const existing = await currentWorkflow();
    const version = (existing?.version ?? 0) + 1;
    const publishedAt = new Date();

    if (existing) {
      await db
        .update(workflow)
        .set({
          graph: parsed.data.graph,
          publishedGraph: parsed.data.graph,
          version,
          publishedAt,
          publishedBy: current.id,
        })
        .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));
    } else {
      await db.insert(workflow).values({
        id: SINGLETON_WORKFLOW_ID,
        graph: parsed.data.graph,
        publishedGraph: parsed.data.graph,
        version,
        publishedAt,
        publishedBy: current.id,
        acceptingApplications: true,
      });
    }

    await db.insert(workflowVersion).values({
      id: crypto.randomUUID(),
      workflowId: SINGLETON_WORKFLOW_ID,
      version,
      graph: parsed.data.graph,
      memo: parsed.data.memo || null,
      publishedBy: current.id,
      publishedByName: current.name,
      createdAt: publishedAt,
    });

    await recordAudit({
      action: "workflow.published",
      actor: current,
      summary: `Published workflow version ${version}.`,
      targetType: "workflow",
      targetLabel: `Version ${version}`,
      detail: { version, memo: parsed.data.memo || null },
    });

    revalidatePath("/admin/workflow");
    revalidatePath("/admin");
    revalidatePath("/application");
    return ok({ version });
  } catch (error) {
    return failFrom(error);
  }
}

/** Throws away draft edits and restores the last published graph. */
export async function revertWorkflowDraft(): Promise<
  ActionResult<{ graph: WorkflowGraph }>
> {
  try {
    const current = await requirePermissionAction("workflow.manage");

    const existing = await currentWorkflow();
    if (!existing?.publishedGraph) {
      return fail("There is no published version to revert to.");
    }

    await db
      .update(workflow)
      .set({ graph: existing.publishedGraph })
      .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));

    await recordAudit({
      action: "workflow.reverted",
      actor: current,
      summary: `Discarded the draft and returned to published version ${existing.version}.`,
      targetType: "workflow",
      detail: { version: existing.version },
    });

    revalidatePath("/admin/workflow");
    return ok({ graph: existing.publishedGraph });
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * Loads an older revision back onto the canvas as the working draft. Nothing
 * goes live until the admin publishes again, which records a new revision.
 */
export async function restoreWorkflowVersion(
  version: number,
): Promise<ActionResult<{ graph: WorkflowGraph }>> {
  try {
    const current = await requirePermissionAction("workflow.manage");

    const revision = await db.query.workflowVersion.findFirst({
      where: and(
        eq(workflowVersion.workflowId, SINGLETON_WORKFLOW_ID),
        eq(workflowVersion.version, version),
      ),
    });
    if (!revision) return fail("That revision no longer exists.");

    await db
      .update(workflow)
      .set({ graph: revision.graph })
      .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));

    await recordAudit({
      action: "workflow.version_restored",
      actor: current,
      summary: `Loaded version ${version} onto the canvas as the draft.`,
      targetType: "workflow",
      targetLabel: `Version ${version}`,
      detail: { version },
    });

    revalidatePath("/admin/workflow");
    return ok({ graph: revision.graph });
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * Removes a published revision from the history.
 *
 * Safe by construction: every application carries its own copy of the graph it
 * was started against, so no running application depends on this row. The live
 * revision is refused because it is what the portal is currently running, and
 * the history would then disagree with the workflow itself.
 */
export async function deleteWorkflowVersion(
  version: number,
): Promise<ActionResult> {
  try {
    const actor = await requirePermissionAction("workflow.manage");

    const [current, revision] = await Promise.all([
      currentWorkflow(),
      db.query.workflowVersion.findFirst({
        where: and(
          eq(workflowVersion.workflowId, SINGLETON_WORKFLOW_ID),
          eq(workflowVersion.version, version),
        ),
      }),
    ]);

    if (!revision) return fail("That revision no longer exists.");
    if (current?.version === version) {
      return fail(
        "Version " +
          version +
          " is live. Publish a different version before deleting it.",
      );
    }

    await db
      .delete(workflowVersion)
      .where(
        and(
          eq(workflowVersion.workflowId, SINGLETON_WORKFLOW_ID),
          eq(workflowVersion.version, version),
        ),
      );

    await recordAudit({
      action: "workflow.version_deleted",
      actor,
      summary: `Deleted workflow version ${version} from the history.`,
      targetType: "workflow",
      targetLabel: `Version ${version}`,
      detail: { version, memo: revision.memo },
    });

    revalidatePath("/admin/workflow");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export type WorkflowRevision = {
  version: number;
  memo: string;
  publishedBy: string;
  createdAt: string;
  nodeCount: number;
  isLive: boolean;
};

export async function listWorkflowVersions(): Promise<
  ActionResult<{ versions: WorkflowRevision[] }>
> {
  try {
    await requirePermissionAction("workflow.manage");

    const [current, rows] = await Promise.all([
      currentWorkflow(),
      db
        .select()
        .from(workflowVersion)
        .where(eq(workflowVersion.workflowId, SINGLETON_WORKFLOW_ID))
        .orderBy(desc(workflowVersion.version)),
    ]);

    return ok({
      versions: rows.map((row) => ({
        version: row.version,
        memo: row.memo ?? "",
        publishedBy: row.publishedByName ?? "Unknown",
        createdAt: row.createdAt.toISOString(),
        nodeCount: row.graph.nodes.length,
        isLive: row.version === current?.version,
      })),
    });
  } catch (error) {
    return failFrom(error);
  }
}

export async function setAcceptingApplications(
  accepting: boolean,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("workflow.manage");

    const existing = await currentWorkflow();
    if (!existing) return fail("The workflow has not been created yet.");
    if (accepting && !existing.publishedGraph) {
      return fail("Publish the workflow before opening applications.");
    }

    await db
      .update(workflow)
      .set({ acceptingApplications: accepting })
      .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));

    await recordAudit({
      action: accepting
        ? "workflow.applications_opened"
        : "workflow.applications_closed",
      actor: current,
      summary: accepting
        ? "Opened the portal to new applications."
        : "Closed the portal to new applications.",
      targetType: "workflow",
    });

    revalidatePath("/admin/workflow");
    revalidatePath("/admin");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
