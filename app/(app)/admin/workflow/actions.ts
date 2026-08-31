"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  fail,
  failFrom,
  ok,
  parseInput,
  type ActionResult,
} from "@/lib/actions";
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailTemplate, role, workflow } from "@/lib/db/schema";
import { SINGLETON_WORKFLOW_ID } from "@/lib/workflow/defaults";
import { hasBlockingIssues, validateGraph } from "@/lib/workflow/graph";
import { workflowGraphSchema, type WorkflowGraph } from "@/lib/workflow/types";

const saveInput = z.object({
  name: z.string().trim().min(2, "Give the workflow a name").max(120),
  description: z.string().trim().max(500).optional().default(""),
  graph: workflowGraphSchema,
});

export type SaveWorkflowInput = z.input<typeof saveInput>;

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
    await requirePermissionAction("workflow.manage");

    const parsed = parseInput(saveInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await currentWorkflow();
    if (existing) {
      await db
        .update(workflow)
        .set({
          name: parsed.data.name,
          description: parsed.data.description || null,
          graph: parsed.data.graph,
        })
        .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));
    } else {
      await db.insert(workflow).values({
        id: SINGLETON_WORKFLOW_ID,
        name: parsed.data.name,
        description: parsed.data.description || null,
        graph: parsed.data.graph,
        publishedGraph: null,
        version: 0,
        acceptingApplications: false,
      });
    }

    const issues = validateGraph(parsed.data.graph, await validationContext());

    revalidatePath("/admin/workflow");
    revalidatePath("/admin");
    return ok({ issues: issues.filter((i) => i.severity === "error").length });
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * Promotes the draft to the published graph and bumps the version. In-flight
 * applications are unaffected: each keeps the snapshot it started with.
 */
export async function publishWorkflow(
  input: SaveWorkflowInput,
): Promise<ActionResult<{ version: number }>> {
  try {
    const current = await requirePermissionAction("workflow.manage");

    const parsed = parseInput(saveInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const issues = validateGraph(parsed.data.graph, await validationContext());
    if (hasBlockingIssues(issues)) {
      return fail(
        `Fix ${issues.filter((i) => i.severity === "error").length} problem(s) before publishing.`,
      );
    }

    const existing = await currentWorkflow();
    const version = (existing?.version ?? 0) + 1;

    if (existing) {
      await db
        .update(workflow)
        .set({
          name: parsed.data.name,
          description: parsed.data.description || null,
          graph: parsed.data.graph,
          publishedGraph: parsed.data.graph,
          version,
          publishedAt: new Date(),
          publishedBy: current.id,
        })
        .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));
    } else {
      await db.insert(workflow).values({
        id: SINGLETON_WORKFLOW_ID,
        name: parsed.data.name,
        description: parsed.data.description || null,
        graph: parsed.data.graph,
        publishedGraph: parsed.data.graph,
        version,
        publishedAt: new Date(),
        publishedBy: current.id,
        acceptingApplications: true,
      });
    }

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
    await requirePermissionAction("workflow.manage");

    const existing = await currentWorkflow();
    if (!existing?.publishedGraph) {
      return fail("There is no published version to revert to.");
    }

    await db
      .update(workflow)
      .set({ graph: existing.publishedGraph })
      .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));

    revalidatePath("/admin/workflow");
    return ok({ graph: existing.publishedGraph });
  } catch (error) {
    return failFrom(error);
  }
}

export async function setAcceptingApplications(
  accepting: boolean,
): Promise<ActionResult> {
  try {
    await requirePermissionAction("workflow.manage");

    const existing = await currentWorkflow();
    if (!existing) return fail("The workflow has not been created yet.");
    if (accepting && !existing.publishedGraph) {
      return fail("Publish the workflow before opening applications.");
    }

    await db
      .update(workflow)
      .set({ acceptingApplications: accepting })
      .where(eq(workflow.id, SINGLETON_WORKFLOW_ID));

    revalidatePath("/admin/workflow");
    revalidatePath("/admin");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
