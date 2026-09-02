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
import { school, schoolAssociateDean, user } from "@/lib/db/schema";
import { searchUsers, type SchoolPerson } from "@/lib/schools/query";
import { syncDesignatedRoles } from "@/lib/schools/sync";

const schoolInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters")
    .max(160, "Use at most 160 characters"),
  code: z.string().trim().max(16).optional().default(""),
  deanId: z.string().trim().optional().default(""),
  associateDeanIds: z.array(z.string().min(1)).default([]),
});
export type SchoolInput = z.input<typeof schoolInput>;

async function assertNameFree(name: string, excludeId?: string) {
  const existing = await db.query.school.findFirst({
    where: eq(school.name, name),
  });
  return !existing || existing.id === excludeId;
}

/** Rewrites the associate deans of one school to exactly this set. */
async function setAssociateDeans(schoolId: string, userIds: string[]) {
  await db
    .delete(schoolAssociateDean)
    .where(eq(schoolAssociateDean.schoolId, schoolId));

  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;

  await db
    .insert(schoolAssociateDean)
    .values(unique.map((userId) => ({ schoolId, userId })));
}

export async function createSchool(input: SchoolInput): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

    const parsed = parseInput(schoolInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    if (!(await assertNameFree(parsed.data.name))) {
      return fail("A school with that name already exists.", {
        name: "That name is taken.",
      });
    }

    const id = crypto.randomUUID();
    await db.insert(school).values({
      id,
      name: parsed.data.name,
      code: parsed.data.code || null,
      deanId: parsed.data.deanId || null,
    });
    await setAssociateDeans(id, parsed.data.associateDeanIds);
    // Naming someone dean is what makes them one, so the role follows the
    // posting rather than waiting for an admin to grant it separately.
    await syncDesignatedRoles();

    await recordAudit({
      action: "school.created",
      actor: current,
      summary: `Created the school "${parsed.data.name}".`,
      targetType: "school",
      targetId: id,
      targetLabel: parsed.data.name,
    });

    revalidatePath("/admin/schools");
    revalidatePath("/admin/users");
    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function updateSchool(
  id: string,
  input: SchoolInput,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

    const parsed = parseInput(schoolInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await db.query.school.findFirst({
      where: eq(school.id, id),
    });
    if (!existing) return fail("That school no longer exists.");

    if (!(await assertNameFree(parsed.data.name, id))) {
      return fail("A school with that name already exists.", {
        name: "That name is taken.",
      });
    }

    await db
      .update(school)
      .set({
        name: parsed.data.name,
        code: parsed.data.code || null,
        deanId: parsed.data.deanId || null,
      })
      .where(eq(school.id, id));
    await setAssociateDeans(id, parsed.data.associateDeanIds);
    await syncDesignatedRoles();

    await recordAudit({
      action: "school.updated",
      actor: current,
      summary: `Updated the school "${parsed.data.name}".`,
      targetType: "school",
      targetId: id,
      targetLabel: parsed.data.name,
      detail: {
        dean: parsed.data.deanId || null,
        associateDeans: parsed.data.associateDeanIds.length,
      },
    });

    revalidatePath("/admin/schools");
    revalidatePath("/admin/users");
    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteSchool(id: string): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("users.manage");

    const existing = await db.query.school.findFirst({
      where: eq(school.id, id),
    });
    if (!existing) return fail("That school no longer exists.");

    // Deleting it would leave those accounts with no school, and an
    // application from one of them with nowhere to go.
    const [members] = await db
      .select({ total: count() })
      .from(user)
      .where(eq(user.schoolId, id));

    if ((members?.total ?? 0) > 0) {
      return fail(
        `${members.total} account${members.total === 1 ? " belongs" : "s belong"} to this school. Move them first.`,
      );
    }

    await db.delete(school).where(eq(school.id, id));
    await syncDesignatedRoles();

    await recordAudit({
      action: "school.deleted",
      actor: current,
      summary: `Deleted the school "${existing.name}".`,
      targetType: "school",
      targetId: id,
      targetLabel: existing.name,
    });

    revalidatePath("/admin/schools");
    revalidatePath("/admin/users");
    revalidatePath("/admin/roles");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/** Candidates for the dean and associate dean pickers. */
export async function findUsers(
  query: string,
): Promise<ActionResult<{ users: SchoolPerson[] }>> {
  try {
    await requirePermissionAction("users.manage");
    return ok({ users: await searchUsers(query) });
  } catch (error) {
    return failFrom(error);
  }
}
