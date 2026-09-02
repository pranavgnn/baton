import { and, eq, inArray, isNotNull } from "drizzle-orm";

import {
  SCHOOL_DESIGNATIONS,
  type RoleDesignation,
} from "@/lib/auth/designations";
import { db } from "@/lib/db";
import { role, school, schoolAssociateDean, userRole } from "@/lib/db/schema";

/**
 * Kept free of the `server-only` marker because the demo seed runs it from a
 * plain node script, the same way an admin's edit runs it from an action.
 *
 * Keeps the dean and associate-dean roles in step with who actually holds
 * those posts.
 *
 * Written as a reconciliation rather than as a diff of one edit: it recomputes
 * the whole desired set from the school table, so it is idempotent, it does the
 * right thing when a role is newly designated, and someone who signs for two
 * schools keeps the role when they are removed from one. Only grants this made
 * (`source: "school"`) are ever withdrawn - a role an admin gave by hand is
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

  for (const designation of SCHOOL_DESIGNATIONS) {
    const roleId = roleFor.get(designation);
    if (!roleId) continue;

    await reconcile(roleId, await holdersOf(designation));
  }
}

/** Everyone who currently holds the post the designation names. */
async function holdersOf(
  designation: (typeof SCHOOL_DESIGNATIONS)[number],
): Promise<string[]> {
  if (designation === "dean") {
    const rows = await db
      .select({ deanId: school.deanId })
      .from(school)
      .where(isNotNull(school.deanId));
    return unique(rows.map((row) => row.deanId as string));
  }

  const rows = await db
    .select({ userId: schoolAssociateDean.userId })
    .from(schoolAssociateDean);
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
        source: "school" as const,
      })),
    );
  }

  // Withdrawn only from people this granted it to: `source` is what separates
  // "they are dean, so they have the role" from "an admin decided".
  const stale = existing
    .filter(
      (row) => row.source === "school" && !shouldHold.includes(row.userId),
    )
    .map((row) => row.userId);

  if (stale.length > 0) {
    await db
      .delete(userRole)
      .where(and(eq(userRole.roleId, roleId), inArray(userRole.userId, stale)));
  }
}

/**
 * Drops school-granted rows for a role that no longer carries the designation.
 *
 * Without this, taking the "dean" designation off a role would leave everyone
 * it had auto-granted holding it for good.
 */
export async function releaseSchoolGrants(roleId: string): Promise<void> {
  await db
    .delete(userRole)
    .where(and(eq(userRole.roleId, roleId), eq(userRole.source, "school")));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
