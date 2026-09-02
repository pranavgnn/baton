import { eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { role, user, userRole } from "@/lib/db/schema";
import { grants } from "./permissions";

/**
 * Better Auth's admin plugin decides who may impersonate from a single string
 * on the user row. The portal decides it from the permissions a person's roles
 * grant, so `user.role` is kept as a derived copy of that one answer and never
 * as a source of truth: it is recomputed whenever roles or their permissions
 * change, exactly as the designated roles are.
 *
 * Nothing else reads it. A person's actual roles are the rows in `user_role`.
 */

export const ADMIN_ROLE = "admin";
export const NON_ADMIN_ROLE = "user";

/** The permission that carries the right to act as another user. */
const IMPERSONATION_PERMISSION = "users.manage" as const;

/** Recomputes the flag for one account. */
export async function syncAdminFlag(userId: string): Promise<void> {
  const rows = await db
    .select({ permissions: role.permissions })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userRole.userId, userId));

  const held = rows.flatMap((row) => row.permissions ?? []);
  await db
    .update(user)
    .set({ role: flagFor(held) })
    .where(eq(user.id, userId));
}

/**
 * Recomputes it for everybody.
 *
 * Cheap at institute scale and worth doing wholesale: editing one role's
 * permissions changes the answer for every one of its holders at once.
 */
export async function syncAdminFlags(): Promise<void> {
  const rows = await db
    .select({ userId: userRole.userId, permissions: role.permissions })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId));

  const heldBy = new Map<string, string[]>();
  for (const row of rows) {
    heldBy.set(row.userId, [
      ...(heldBy.get(row.userId) ?? []),
      ...(row.permissions ?? []),
    ]);
  }

  const admins: string[] = [];
  for (const [userId, held] of heldBy) {
    if (flagFor(held) === ADMIN_ROLE) admins.push(userId);
  }

  if (admins.length === 0) {
    await db.update(user).set({ role: NON_ADMIN_ROLE });
    return;
  }

  // Everyone else, including accounts holding no role at all, is not one.
  await db
    .update(user)
    .set({ role: ADMIN_ROLE })
    .where(inArray(user.id, admins));
  await db
    .update(user)
    .set({ role: NON_ADMIN_ROLE })
    .where(notInArray(user.id, admins));
}

function flagFor(held: readonly string[]): string {
  return grants(held, IMPERSONATION_PERMISSION) ? ADMIN_ROLE : NON_ADMIN_ROLE;
}
