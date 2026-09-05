import { and, eq, inArray, isNotNull } from "drizzle-orm";

import {
  DEPARTMENT_DESIGNATIONS,
  type RoleDesignation,
} from "@/lib/auth/designations";
import { syncAdminFlags } from "@/lib/auth/admin-flag";
import { db } from "@/lib/db";
import { role, department, departmentDeputy, userRole } from "@/lib/db/schema";

/**
 * Kept free of the `server-only` marker because the demo seed runs it from a
 * plain node script, the same way an admin's edit runs it from an action.
 *
 * Keeps the head and associate-head roles in step with who actually holds
 * those posts.
 *
 * Written as a reconciliation rather than as a diff of one edit: it recomputes
 * the whole desired set from the department table, so it is idempotent, it does the
 * right thing when a role is newly designated, and someone who signs for two
 * departments keeps the role when they are removed from one. Only grants this made
 * (`source: "department"`) are ever withdrawn - a role an admin gave by hand is
 * theirs to take away.
 */
export async function syncDesignatedRoles(): Promise<void> {
  const designated = await db
    .select({ id: role.id, designation: role.designation })
    .from(role)
    .where(isNotNull(role.designation));

  const roleFor = new Map<RoleDesignation, string>(
    designated
      .filter((row) => row.designation)
      .map((row) => [row.designation as RoleDesignation, row.id]),
  );

  for (const designation of DEPARTMENT_DESIGNATIONS) {
    const roleId = roleFor.get(designation);
    if (!roleId) continue;

    await reconcile(roleId, await holdersOf(designation));
  }

  // A designated role could itself grant `users.manage`, so who may act as
  // another user can change with a posting.
  await syncAdminFlags();
}

/** Everyone who currently holds the post the designation names. */
async function holdersOf(
  designation: (typeof DEPARTMENT_DESIGNATIONS)[number],
): Promise<string[]> {
  if (designation === "head") {
    const rows = await db
      .select({ headId: department.headId })
      .from(department)
      .where(isNotNull(department.headId));
    return unique(rows.map((row) => row.headId as string));
  }

  const rows = await db
    .select({ userId: departmentDeputy.userId })
    .from(departmentDeputy);
  return unique(rows.map((row) => row.userId));
}

async function reconcile(roleId: string, shouldHold: string[]): Promise<void> {
  const existing = await db
    .select({ userId: userRole.userId, source: userRole.source })
    .from(userRole)
    .where(eq(userRole.roleId, roleId));

  const held = new Set(existing.map((row) => row.userId));

  const missing = shouldHold.filter((userId) => !held.has(userId));
  if (missing.length > 0) {
    await db.insert(userRole).values(
      missing.map((userId) => ({
        userId,
        roleId,
        source: "department" as const,
      })),
    );
  }

  // Withdrawn only from people this granted it to: `source` is what separates
  // "they are head, so they have the role" from "an admin decided".
  const stale = existing
    .filter(
      (row) => row.source === "department" && !shouldHold.includes(row.userId),
    )
    .map((row) => row.userId);

  if (stale.length > 0) {
    await db
      .delete(userRole)
      .where(and(eq(userRole.roleId, roleId), inArray(userRole.userId, stale)));
  }
}

/**
 * Drops department-granted rows for a role that no longer carries the designation.
 *
 * Without this, taking the "head" designation off a role would leave everyone
 * it had auto-granted holding it for good.
 */
export async function releaseDepartmentGrants(roleId: string): Promise<void> {
  await db
    .delete(userRole)
    .where(and(eq(userRole.roleId, roleId), eq(userRole.source, "department")));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
