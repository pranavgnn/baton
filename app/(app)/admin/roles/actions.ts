"use server";

import { and, count, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit/record";
import { z } from "zod";

import {
  fail,
  failFrom,
  ok,
  parseInput,
  type ActionResult,
} from "@/lib/actions";
import {
  ROLE_DESIGNATION_KEYS,
  designationLabel,
  type RoleDesignation,
} from "@/lib/auth/designations";
import {
  PERMISSION_KEYS,
  SUPER_ADMIN_PERMISSION,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  application,
  role,
  school,
  user,
  userRole,
  workflow,
} from "@/lib/db/schema";
import { syncAdminFlags } from "@/lib/auth/admin-flag";
import { releaseSchoolGrants, syncDesignatedRoles } from "@/lib/schools/sync";
import { SINGLETON_WORKFLOW_ID } from "@/lib/workflow/defaults";
import { stageNodes } from "@/lib/workflow/graph";

const roleInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters")
    .max(64, "Use at most 64 characters"),
  description: z.string().trim().max(280).optional().default(""),
  permissions: z
    .array(z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]))
    .default([]),
  /** Empty string means "no standing post", which is the common case. */
  designation: z
    .union([
      z.literal(""),
      z.enum(ROLE_DESIGNATION_KEYS as [RoleDesignation, ...RoleDesignation[]]),
    ])
    .default(""),
});

export type RoleInput = z.input<typeof roleInput>;

/**
 * A designation names one role, so claiming one has to take it off whoever
 * held it - refusing instead would leave an admin unable to move it without
 * first knowing where it currently sits.
 */
async function claimDesignation(
  designation: RoleDesignation,
  roleId: string,
): Promise<void> {
  await db
    .update(role)
    .set({ designation: null })
    .where(and(eq(role.designation, designation), ne(role.id, roleId)));
}

async function assertNameFree(name: string, excludeId?: string) {
  const existing = await db.query.role.findFirst({
    where: excludeId
      ? and(eq(role.name, name), ne(role.id, excludeId))
      : eq(role.name, name),
  });
  return !existing;
}

export async function createRole(input: RoleInput): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("roles.manage");

    const parsed = parseInput(roleInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    if (!(await assertNameFree(parsed.data.name))) {
      return fail("A role with that name already exists.", {
        name: "That name is taken.",
      });
    }

    const [last] = await db
      .select({ priority: role.priority })
      .from(role)
      .orderBy(desc(role.priority))
      .limit(1);

    const id = crypto.randomUUID();
    // Freed before the insert, or the unique index rejects the new row.
    if (parsed.data.designation) {
      await claimDesignation(parsed.data.designation, id);
    }

    await db.insert(role).values({
      id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      permissions: parsed.data.permissions,
      // Appended to the end: a new role must not silently become the default
      // that unnamed users are given.
      priority: (last?.priority ?? -1) + 1,
      isSystem: false,
      designation: parsed.data.designation || null,
    });

    if (parsed.data.designation) await syncDesignatedRoles();

    await recordAudit({
      action: "role.created",
      actor: current,
      summary: parsed.data.designation
        ? `Created the role "${parsed.data.name}", which now stands for ${designationLabel(parsed.data.designation).toLowerCase()}.`
        : `Created the role "${parsed.data.name}".`,
      targetType: "role",
      targetId: id,
      targetLabel: parsed.data.name,
      detail: {
        permissions: parsed.data.permissions,
        designation: parsed.data.designation || null,
      },
    });

    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function updateRole(
  id: string,
  input: RoleInput,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("roles.manage");

    const parsed = parseInput(roleInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await db.query.role.findFirst({ where: eq(role.id, id) });
    if (!existing) return fail("That role no longer exists.");

    if (!(await assertNameFree(parsed.data.name, id))) {
      return fail("A role with that name already exists.", {
        name: "That name is taken.",
      });
    }

    // The seeded Super Admin keeps its wildcard so the portal can never be
    // locked out of its own administration.
    const permissions = existing.permissions.includes(SUPER_ADMIN_PERMISSION)
      ? existing.permissions
      : parsed.data.permissions;

    const designation = parsed.data.designation || null;
    if (designation) await claimDesignation(designation, id);

    await db
      .update(role)
      .set({
        name: parsed.data.name,
        description: parsed.data.description || null,
        permissions,
        designation,
      })
      .where(eq(role.id, id));

    // Granting or withdrawing `users.manage` changes who may act as another
    // user, for every holder of this role at once.
    await syncAdminFlags();

    if (existing.designation !== designation) {
      // Whatever this role was auto-granted for no longer applies; the
      // reconciliation then re-grants under whichever role now holds it.
      await releaseSchoolGrants(id);
    }
    await syncDesignatedRoles();

    await recordAudit({
      action: "role.updated",
      actor: current,
      summary: `Updated the role "${parsed.data.name}".`,
      targetType: "role",
      targetId: id,
      targetLabel: parsed.data.name,
      detail: { permissions, designation },
    });

    revalidatePath("/admin/roles");
    revalidatePath("/admin/users");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * Persists the order the admin dragged the roles into. Priority is positional,
 * so the whole list is rewritten in one transaction rather than shuffling
 * individual numbers around.
 */
export async function reorderRoles(
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("roles.manage");

    const existing = await db.select({ id: role.id }).from(role);
    const known = new Set(existing.map((row) => row.id));

    if (
      orderedIds.length !== known.size ||
      orderedIds.some((id) => !known.has(id)) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      return fail("The role list has changed. Reload and try again.");
    }

    await db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx.update(role).set({ priority: index }).where(eq(role.id, id));
      }
    });

    await recordAudit({
      action: "role.reordered",
      actor: current,
      summary: "Changed the order of the roles, and with it the default role.",
      targetType: "role",
      detail: { order: orderedIds },
    });

    revalidatePath("/admin/roles");
    revalidatePath("/admin/users");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteRole(id: string): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("roles.manage");

    const existing = await db.query.role.findFirst({ where: eq(role.id, id) });
    if (!existing) return fail("That role no longer exists.");
    if (existing.isSystem) {
      return fail("System roles cannot be deleted, only renamed.");
    }

    const [assigned] = await db
      .select({ total: count() })
      .from(userRole)
      .where(eq(userRole.roleId, id));
    if ((assigned?.total ?? 0) > 0) {
      return fail(
        `${assigned.total} user${assigned.total === 1 ? " is" : "s are"} still assigned this role. Reassign them first.`,
      );
    }

    // Deleting a role referenced by a stage would silently break the workflow.
    const flow = await db.query.workflow.findFirst({
      where: eq(workflow.id, SINGLETON_WORKFLOW_ID),
    });
    const usedBy = [
      ...(flow?.graph ? stageNodes(flow.graph) : []),
      ...(flow?.publishedGraph ? stageNodes(flow.publishedGraph) : []),
    ].filter((node) => node.data.roleId === id);

    if (usedBy.length > 0) {
      const labels = Array.from(new Set(usedBy.map((n) => n.data.label)));
      return fail(
        `This role is assigned to workflow stage${labels.length === 1 ? "" : "s"}: ${labels.join(", ")}.`,
      );
    }

    // In-flight applications run on their own graph snapshot, which may still
    // route through this role even after it has been removed from the live
    // workflow. Deleting it would strand them with nobody able to act.
    const inFlight = await db
      .select({ reference: application.reference, graph: application.graph })
      .from(application)
      .where(eq(application.status, "in_progress"));

    const stranded = inFlight.filter((row) =>
      stageNodes(row.graph).some((node) => node.data.roleId === id),
    );
    if (stranded.length > 0) {
      return fail(
        `${stranded.length} in-progress application${stranded.length === 1 ? "" : "s"} still route through this role (${stranded
          .slice(0, 3)
          .map((row) => row.reference)
          .join(", ")}${stranded.length > 3 ? ", …" : ""}).`,
      );
    }

    await db.delete(role).where(eq(role.id, id));

    await recordAudit({
      action: "role.deleted",
      actor: current,
      summary: `Deleted the role "${existing.name}".`,
      targetType: "role",
      targetId: id,
      targetLabel: existing.name,
    });

    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Who holds a role                                                           */
/* -------------------------------------------------------------------------- */

export type RoleMember = {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  schoolName: string;
  disabled: boolean;
};

/**
 * Everyone holding one role.
 *
 * Fetched when the role is opened rather than sent with the page: a role's
 * members are only wanted one role at a time, and shipping every membership in
 * the institute to render a table of counts would be a great deal of nothing.
 */
export async function listRoleMembers(
  roleId: string,
): Promise<ActionResult<RoleMember[]>> {
  try {
    await requirePermissionAction("roles.manage");

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        schoolName: school.name,
        disabled: user.disabled,
      })
      .from(userRole)
      .innerJoin(user, eq(user.id, userRole.userId))
      .leftJoin(school, eq(school.id, user.schoolId))
      .where(eq(userRole.roleId, roleId))
      .orderBy(user.name);

    return ok(
      rows.map((row) => ({
        ...row,
        employeeId: row.employeeId ?? "",
        schoolName: row.schoolName ?? "",
      })),
    );
  } catch (error) {
    return failFrom(error);
  }
}
