"use server";

import { count, eq } from "drizzle-orm";
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
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { department, departmentDeputy, user } from "@/lib/db/schema";
import { searchUsers, type DepartmentPerson } from "@/lib/departments/query";
import { syncDesignatedRoles } from "@/lib/departments/sync";

const departmentInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters")
    .max(160, "Use at most 160 characters"),
  code: z.string().trim().max(16).optional().default(""),
  headId: z.string().trim().optional().default(""),
  deputyIds: z.array(z.string().min(1)).default([]),
});
export type DepartmentInput = z.input<typeof departmentInput>;

async function assertNameFree(name: string, excludeId?: string) {
  const existing = await db.query.department.findFirst({
    where: eq(department.name, name),
  });
  return !existing || existing.id === excludeId;
}

/** Rewrites the deputies of one department to exactly this set. */
async function setDeputies(departmentId: string, userIds: string[]) {
  await db
    .delete(departmentDeputy)
    .where(eq(departmentDeputy.departmentId, departmentId));

  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;

  await db
    .insert(departmentDeputy)
    .values(unique.map((userId) => ({ departmentId, userId })));
}

export async function createDepartment(
  input: DepartmentInput,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

    const parsed = parseInput(departmentInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    if (!(await assertNameFree(parsed.data.name))) {
      return fail("A department with that name already exists.", {
        name: "That name is taken.",
      });
    }

    const id = crypto.randomUUID();
    await db.insert(department).values({
      id,
      name: parsed.data.name,
      code: parsed.data.code || null,
      headId: parsed.data.headId || null,
    });
    await setDeputies(id, parsed.data.deputyIds);
    // Naming someone head is what makes them one, so the role follows the
    // posting rather than waiting for an admin to grant it separately.
    await syncDesignatedRoles();

    await recordAudit({
      action: "department.created",
      actor: current,
      summary: `Created the department "${parsed.data.name}".`,
      targetType: "department",
      targetId: id,
      targetLabel: parsed.data.name,
    });

    revalidatePath("/admin/departments");
    revalidatePath("/admin/users");
    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function updateDepartment(
  id: string,
  input: DepartmentInput,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

    const parsed = parseInput(departmentInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await db.query.department.findFirst({
      where: eq(department.id, id),
    });
    if (!existing) return fail("That department no longer exists.");

    if (!(await assertNameFree(parsed.data.name, id))) {
      return fail("A department with that name already exists.", {
        name: "That name is taken.",
      });
    }

    await db
      .update(department)
      .set({
        name: parsed.data.name,
        code: parsed.data.code || null,
        headId: parsed.data.headId || null,
      })
      .where(eq(department.id, id));
    await setDeputies(id, parsed.data.deputyIds);
    await syncDesignatedRoles();

    await recordAudit({
      action: "department.updated",
      actor: current,
      summary: `Updated the department "${parsed.data.name}".`,
      targetType: "department",
      targetId: id,
      targetLabel: parsed.data.name,
      detail: {
        head: parsed.data.headId || null,
        deputies: parsed.data.deputyIds.length,
      },
    });

    revalidatePath("/admin/departments");
    revalidatePath("/admin/users");
    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

    const existing = await db.query.department.findFirst({
      where: eq(department.id, id),
    });
    if (!existing) return fail("That department no longer exists.");

    // Deleting it would leave those accounts with no department, and an
    // application from one of them with nowhere to go.
    const [members] = await db
      .select({ total: count() })
      .from(user)
      .where(eq(user.departmentId, id));

    if ((members?.total ?? 0) > 0) {
      return fail(
        `${members.total} account${members.total === 1 ? " belongs" : "s belong"} to this department. Move them first.`,
      );
    }

    await db.delete(department).where(eq(department.id, id));
    await syncDesignatedRoles();

    await recordAudit({
      action: "department.deleted",
      actor: current,
      summary: `Deleted the department "${existing.name}".`,
      targetType: "department",
      targetId: id,
      targetLabel: existing.name,
    });

    revalidatePath("/admin/departments");
    revalidatePath("/admin/users");
    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/** Candidates for the head and deputy pickers. */
export async function findUsers(
  query: string,
): Promise<ActionResult<{ users: DepartmentPerson[] }>> {
  try {
    await requirePermissionAction("users.manage");
    return ok({ users: await searchUsers(query) });
  } catch (error) {
    return failFrom(error);
  }
}
