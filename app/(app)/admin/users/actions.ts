"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  fail,
  failFrom,
  ok,
  parseInput,
  type ActionResult,
} from "@/lib/actions";
import { provisionUser, sendActivationLink } from "@/lib/auth/provision";
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { application, role, user, userRole } from "@/lib/db/schema";

const userInput = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters")
    .max(120, "Use at most 120 characters"),
  employeeId: z.string().trim().max(40).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
  designation: z.string().trim().max(120).optional().default(""),
  roleIds: z.array(z.string().min(1)).default([]),
  /** Sends the activation email immediately after provisioning. */
  sendInvite: z.boolean().default(true),
});

export type UserInput = z.input<typeof userInput>;

async function assertRolesExist(roleIds: string[]) {
  if (roleIds.length === 0) return true;
  const rows = await db
    .select({ id: role.id })
    .from(role)
    .where(inArray(role.id, roleIds));
  return rows.length === roleIds.length;
}

async function setRoles(userId: string, roleIds: string[]) {
  await db.delete(userRole).where(eq(userRole.userId, userId));
  if (roleIds.length === 0) return;
  await db
    .insert(userRole)
    .values(roleIds.map((roleId) => ({ userId, roleId })))
    .onConflictDoNothing();
}

/**
 * Whitelisting a user: the account is created without a usable password and
 * the invitee activates it through the reset-password link.
 */
export async function inviteUser(input: UserInput): Promise<ActionResult> {
  try {
    await requirePermissionAction("users.manage");

    const parsed = parseInput(userInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await db.query.user.findFirst({
      where: eq(user.email, parsed.data.email),
    });
    if (existing) {
      return fail("That email is already on the whitelist.", {
        email: "Already provisioned.",
      });
    }

    if (!(await assertRolesExist(parsed.data.roleIds))) {
      return fail("One of the selected roles no longer exists.");
    }

    const provisioned = await provisionUser({
      email: parsed.data.email,
      name: parsed.data.name,
      employeeId: parsed.data.employeeId || null,
      department: parsed.data.department || null,
      designation: parsed.data.designation || null,
    });

    // No role named means the default: the lowest-priority role.
    let roleIds = parsed.data.roleIds;
    if (roleIds.length === 0) {
      const [fallback] = await db
        .select({ id: role.id })
        .from(role)
        .orderBy(role.priority, role.name)
        .limit(1);
      if (fallback) roleIds = [fallback.id];
    }

    await setRoles(provisioned.id, roleIds);

    if (parsed.data.sendInvite) {
      await sendActivationLink(parsed.data.email);
    }

    revalidatePath("/admin/users");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

const updateInput = userInput.omit({ email: true, sendInvite: true });
export type UpdateUserInput = z.input<typeof updateInput>;

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<ActionResult> {
  try {
    await requirePermissionAction("users.manage");

    const parsed = parseInput(updateInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!existing) return fail("That user no longer exists.");

    if (!(await assertRolesExist(parsed.data.roleIds))) {
      return fail("One of the selected roles no longer exists.");
    }

    await db
      .update(user)
      .set({
        name: parsed.data.name,
        employeeId: parsed.data.employeeId || null,
        department: parsed.data.department || null,
        designation: parsed.data.designation || null,
      })
      .where(eq(user.id, id));

    await setRoles(id, parsed.data.roleIds);

    revalidatePath("/admin/users");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

const importRowSchema = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().max(120),
  employeeId: z.string().trim().max(40).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
  designation: z.string().trim().max(120).optional().default(""),
  roles: z.array(z.string().trim()).default([]),
});

const bulkInput = z.object({
  rows: z.array(importRowSchema).min(1).max(2000),
  sendInvites: z.boolean().default(true),
});

export type BulkImportInput = z.input<typeof bulkInput>;

export type BulkImportOutcome = {
  created: number;
  skipped: { email: string; reason: string }[];
};

/**
 * Provisions many accounts at once.
 *
 * Rows are independent: one bad row is reported and skipped rather than
 * failing the whole import, because re-uploading a 400-line file to fix one
 * typo is miserable. Roles are matched by name; a row naming none is given the
 * lowest-priority role, which is the portal's default.
 */
export async function bulkImportUsers(
  input: BulkImportInput,
): Promise<ActionResult<BulkImportOutcome>> {
  try {
    await requirePermissionAction("users.manage");

    const parsed = parseInput(bulkInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const allRoles = await db
      .select({ id: role.id, name: role.name, priority: role.priority })
      .from(role)
      .orderBy(role.priority, role.name);

    if (allRoles.length === 0) {
      return fail("Create at least one role before importing users.");
    }

    const byName = new Map(
      allRoles.map((entry) => [entry.name.toLowerCase(), entry.id]),
    );
    const defaultRoleId = allRoles[0].id;

    const skipped: BulkImportOutcome["skipped"] = [];
    let created = 0;

    for (const row of parsed.data.rows) {
      const existing = await db.query.user.findFirst({
        where: eq(user.email, row.email),
      });
      if (existing) {
        skipped.push({ email: row.email, reason: "Already on the whitelist" });
        continue;
      }

      const unknown = row.roles.filter(
        (name) => !byName.has(name.toLowerCase()),
      );
      if (unknown.length > 0) {
        skipped.push({
          email: row.email,
          reason: `Unknown role: ${unknown.join(", ")}`,
        });
        continue;
      }

      const roleIds =
        row.roles.length > 0
          ? row.roles.map((name) => byName.get(name.toLowerCase())!)
          : [defaultRoleId];

      try {
        const provisioned = await provisionUser({
          email: row.email,
          name: row.name,
          employeeId: row.employeeId || null,
          department: row.department || null,
          designation: row.designation || null,
        });

        await setRoles(provisioned.id, roleIds);
        if (parsed.data.sendInvites) await sendActivationLink(row.email);
        created += 1;
      } catch (error) {
        skipped.push({
          email: row.email,
          reason:
            error instanceof Error ? error.message : "Could not provision",
        });
      }
    }

    revalidatePath("/admin/users");
    return ok({ created, skipped });
  } catch (error) {
    return failFrom(error);
  }
}

export async function resendInvite(id: string): Promise<ActionResult> {
  try {
    await requirePermissionAction("users.manage");

    const target = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!target) return fail("That user no longer exists.");

    await sendActivationLink(target.email);
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function setUserDisabled(
  id: string,
  disabled: boolean,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");
    if (current.id === id) {
      return fail("You cannot disable your own account.");
    }

    const target = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!target) return fail("That user no longer exists.");

    await db.update(user).set({ disabled }).where(eq(user.id, id));

    revalidatePath("/admin/users");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");
    if (current.id === id) {
      return fail("You cannot delete your own account.");
    }

    const owned = await db.query.application.findFirst({
      where: eq(application.applicantId, id),
    });
    if (owned) {
      return fail(
        "This user has applications on record. Disable the account instead so the history is preserved.",
      );
    }

    await db.delete(user).where(eq(user.id, id));

    revalidatePath("/admin/users");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
