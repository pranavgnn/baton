"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { recordAudit } from "@/lib/audit/record";
import { z } from "zod";

import {
  fail,
  failFrom,
  ok,
  parseInput,
  type ActionResult,
} from "@/lib/actions";
import { auth } from "@/lib/auth";
import { syncAdminFlag } from "@/lib/auth/admin-flag";
import { applyAuthCookies } from "@/lib/auth/cookies";
import { refusalMessage, refuseImpersonation } from "@/lib/auth/impersonation";
import { provisionUser, sendActivationLink } from "@/lib/auth/provision";
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { application, role, department, user, userRole } from "@/lib/db/schema";
import { USER_TYPE_KEYS, type UserType } from "@/lib/users/profile";

const isoDay = z
  .union([z.literal(""), z.iso.date("Enter a date")])
  .optional()
  .default("");

/**
 * The particulars an account carries beyond its name and address. Shared by
 * the invite form, the edit form and the importer so the three cannot drift.
 */
const profileInput = {
  employeeId: z.string().trim().max(40).optional().default(""),
  departmentId: z.string().trim().optional().default(""),
  designation: z.string().trim().max(120).optional().default(""),
  institution: z.string().trim().max(160).optional().default(""),
  userType: z
    .union([z.literal(""), z.enum(USER_TYPE_KEYS as [UserType, ...UserType[]])])
    .optional()
    .default(""),
  /** ISO days, as an `<input type="date">` produces. */
  dateOfBirth: isoDay,
  dateOfJoining: isoDay,
  phone: z.string().trim().max(40).optional().default(""),
  personalEmail: z
    .union([z.literal(""), z.email("Enter a valid email address")])
    .optional()
    .default(""),
  address: z.string().trim().max(400).optional().default(""),
};

/** What the profile fields become in the database: "" means "not recorded". */
function profileColumns(input: {
  employeeId: string;
  departmentId: string;
  designation: string;
  institution: string;
  userType: string;
  dateOfBirth: string;
  dateOfJoining: string;
  phone: string;
  personalEmail: string;
  address: string;
}) {
  return {
    employeeId: input.employeeId || null,
    departmentId: input.departmentId || null,
    designation: input.designation || null,
    institution: input.institution || null,
    userType: (input.userType || null) as UserType | null,
    dateOfBirth: input.dateOfBirth || null,
    dateOfJoining: input.dateOfJoining || null,
    phone: input.phone || null,
    personalEmail: input.personalEmail || null,
    address: input.address || null,
  };
}

const userInput = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters")
    .max(120, "Use at most 120 characters"),
  ...profileInput,
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
  // The list is rewritten wholesale, so how each retained role was granted has
  // to be carried across: a role held because the person is head of a department
  // must not quietly become a hand-granted one that outlives the posting.
  const before = await db
    .select({ roleId: userRole.roleId, source: userRole.source })
    .from(userRole)
    .where(eq(userRole.userId, userId));
  const sourceOf = new Map(before.map((row) => [row.roleId, row.source]));

  await db.delete(userRole).where(eq(userRole.userId, userId));
  if (roleIds.length === 0) return;
  await db
    .insert(userRole)
    .values(
      roleIds.map((roleId) => ({
        userId,
        roleId,
        source: sourceOf.get(roleId) ?? "manual",
      })),
    )
    .onConflictDoNothing();

  // Better Auth needs to know whether this account may act as another, and
  // that answer is derived from the roles just written.
  await syncAdminFlag(userId);
}

/**
 * Whitelisting a user: the account is created without a usable password and
 * the invitee activates it through the reset-password link.
 */
export async function inviteUser(input: UserInput): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

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
      ...profileColumns(parsed.data),
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

    await recordAudit({
      action: "user.invited",
      actor: current,
      summary: `Added ${parsed.data.email} to the whitelist.`,
      targetType: "user",
      targetId: provisioned.id,
      targetLabel: parsed.data.email,
      detail: { roleIds, invited: parsed.data.sendInvite },
    });

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
    const current = await requirePermissionAction("users.manage");

    const parsed = parseInput(updateInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!existing) return fail("That user no longer exists.");

    if (!(await assertRolesExist(parsed.data.roleIds))) {
      return fail("One of the selected roles no longer exists.");
    }

    await db
      .update(user)
      .set({ name: parsed.data.name, ...profileColumns(parsed.data) })
      .where(eq(user.id, id));

    await setRoles(id, parsed.data.roleIds);

    await recordAudit({
      action: "user.updated",
      actor: current,
      summary: `Updated the details and roles of ${existing.email}.`,
      targetType: "user",
      targetId: id,
      targetLabel: existing.email,
      detail: { roleIds: parsed.data.roleIds },
    });

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
  /** Named in words and matched against the departments the portal holds. */
  department: z.string().trim().max(200).optional().default(""),
  designation: z.string().trim().max(120).optional().default(""),
  institution: z.string().trim().max(160).optional().default(""),
  userType: z.string().trim().max(20).optional().default(""),
  dateOfBirth: isoDay,
  dateOfJoining: isoDay,
  phone: z.string().trim().max(40).optional().default(""),
  personalEmail: z
    .union([z.literal(""), z.email()])
    .optional()
    .default(""),
  address: z.string().trim().max(400).optional().default(""),
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
    const current = await requirePermissionAction("users.manage");

    const parsed = parseInput(bulkInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const allRoles = await db
      .select({ id: role.id, name: role.name, priority: role.priority })
      .from(role)
      .orderBy(role.priority, role.name);

    // A row names its department in words; unknown names are left unset rather
    // than failing the row, so one typo does not cost a 400-line import.
    const departments = await db
      .select({ id: department.id, name: department.name })
      .from(department);
    const departmentIdByName = new Map(
      departments.map((entry) => [entry.name.trim().toLowerCase(), entry.id]),
    );

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
          ...profileColumns({
            ...row,
            departmentId:
              departmentIdByName.get(row.department.trim().toLowerCase()) ?? "",
          }),
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

    await recordAudit({
      action: "user.imported",
      actor: current,
      summary: `Imported ${created} user(s), skipping ${skipped.length}.`,
      targetType: "user",
      detail: { created, skipped: skipped.map((entry) => entry.email) },
    });

    revalidatePath("/admin/users");
    return ok({ created, skipped });
  } catch (error) {
    return failFrom(error);
  }
}

export async function resendInvite(id: string): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

    const target = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!target) return fail("That user no longer exists.");

    await sendActivationLink(target.email);

    await recordAudit({
      action: "user.invite_resent",
      actor: current,
      summary: `Sent ${target.email} a new activation link.`,
      targetType: "user",
      targetId: id,
      targetLabel: target.email,
    });

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

    await recordAudit({
      action: disabled ? "user.disabled" : "user.enabled",
      actor: current,
      summary: disabled
        ? `Disabled access for ${target.email}.`
        : `Restored access for ${target.email}.`,
      targetType: "user",
      targetId: id,
      targetLabel: target.email,
    });

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

    const target = await db.query.user.findFirst({ where: eq(user.id, id) });
    await db.delete(user).where(eq(user.id, id));

    await recordAudit({
      action: "user.deleted",
      actor: current,
      summary: `Removed ${target?.email ?? id} from the whitelist.`,
      targetType: "user",
      targetId: id,
      targetLabel: target?.email,
    });

    revalidatePath("/admin/users");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * Signs the administrator in as somebody else, for up to an hour.
 *
 * The session swap is Better Auth's (`admin.impersonateUser`), which keeps the
 * administrator's own session aside and restores it when they stop. What is
 * added here is the portal's own gate: its permission rather than the plugin's
 * notion of an admin, the rule that nobody may borrow permissions they do not
 * hold, and a record of it in the audit log.
 */
export async function impersonateUser(id: string): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");
    if (current.impersonatedBy) {
      return fail("Stop the current impersonation before starting another.");
    }

    const target = await getUserForImpersonation(id);
    if (!target) return fail("That account no longer exists.");

    const refusal = refuseImpersonation(current, target);
    if (refusal) return fail(refusalMessage(refusal));

    // Recorded before the swap: afterwards the session belongs to the person
    // being impersonated, and the record would name the wrong actor.
    await recordAudit({
      action: "user.impersonation_started",
      actor: current,
      summary: `${current.name} started acting as ${target.name} (${target.email}).`,
      targetType: "user",
      targetId: target.id,
      targetLabel: target.email,
    });

    const swapped = await auth.api.impersonateUser({
      body: { userId: target.id },
      headers: await headers(),
      asResponse: true,
    });
    if (!swapped.ok) return fail("That impersonation could not be started.");
    await applyAuthCookies(swapped);

    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/** The permissions an account holds, for the impersonation rules to judge. */
async function getUserForImpersonation(id: string) {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      disabled: user.disabled,
      permissions: role.permissions,
    })
    .from(user)
    .leftJoin(userRole, eq(userRole.userId, user.id))
    .leftJoin(role, eq(role.id, userRole.roleId))
    .where(eq(user.id, id));

  const first = rows[0];
  if (!first) return null;

  return {
    id: first.id,
    name: first.name,
    email: first.email,
    disabled: first.disabled,
    permissions: Array.from(
      new Set(rows.flatMap((row) => row.permissions ?? [])),
    ),
  };
}
