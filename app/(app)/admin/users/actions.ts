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

    await setRoles(provisioned.id, parsed.data.roleIds);

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
