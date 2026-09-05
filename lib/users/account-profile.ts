import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { department, user } from "@/lib/db/schema";
import type { PrefillProfile } from "@/lib/workflow/autofill";
import { userTypeLabel } from "./profile";

/**
 * One account as a form sees it: the values a prefilled question draws on,
 * keyed exactly as `USER_FIELDS` is.
 *
 * Written out rather than derived from the row so the two ends of a prefill
 * cannot drift apart silently, and so what fills a form is what a person would
 * write - the department's name rather than its id, "Regular" rather than
 * `regular`.
 */
export async function accountProfile(userId: string): Promise<PrefillProfile> {
  const rows = await db
    .select({
      email: user.email,
      name: user.name,
      employeeId: user.employeeId,
      designation: user.designation,
      institution: user.institution,
      userType: user.userType,
      dateOfBirth: user.dateOfBirth,
      dateOfJoining: user.dateOfJoining,
      dateOfLastPromotion: user.dateOfLastPromotion,
      phone: user.phone,
      personalEmail: user.personalEmail,
      address: user.address,
      department: department.name,
    })
    .from(user)
    .leftJoin(department, eq(department.id, user.departmentId))
    .where(eq(user.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return {};

  return {
    ...row,
    userType: row.userType ? userTypeLabel(row.userType) : null,
  };
}
