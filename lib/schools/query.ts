import "server-only";

import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { school, schoolAssociateDean, user, userRole } from "@/lib/db/schema";

export type SchoolPerson = { id: string; name: string; email: string };

export type SchoolRecord = {
  id: string;
  name: string;
  code: string;
  dean: SchoolPerson | null;
  associateDeans: SchoolPerson[];
  /** How many people give this as their school. */
  memberCount: number;
};

/** Every school, with the people who sign for it. */
export async function listSchools(): Promise<SchoolRecord[]> {
  // A proper alias: the query joins the user table for the dean while the
  // count below reads it as itself.
  const dean = alias(user, "dean");

  const [schools, associates, counts] = await Promise.all([
    db
      .select({
        id: school.id,
        name: school.name,
        code: school.code,
        deanId: school.deanId,
        deanName: dean.name,
        deanEmail: dean.email,
      })
      .from(school)
      .leftJoin(dean, eq(dean.id, school.deanId))
      .orderBy(asc(school.name)),

    db
      .select({
        schoolId: schoolAssociateDean.schoolId,
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(schoolAssociateDean)
      .innerJoin(user, eq(user.id, schoolAssociateDean.userId))
      .orderBy(asc(user.name)),

    db
      .select({ schoolId: user.schoolId, total: sql<number>`count(*)::int` })
      .from(user)
      .groupBy(user.schoolId),
  ]);

  const bySchool = new Map<string, SchoolPerson[]>();
  for (const row of associates) {
    const list = bySchool.get(row.schoolId) ?? [];
    list.push({ id: row.id, name: row.name, email: row.email });
    bySchool.set(row.schoolId, list);
  }

  const memberCounts = new Map(
    counts
      .filter((row): row is { schoolId: string; total: number } =>
        Boolean(row.schoolId),
      )
      .map((row) => [row.schoolId, row.total]),
  );

  return schools.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    dean:
      row.deanId && row.deanName
        ? { id: row.deanId, name: row.deanName, email: row.deanEmail ?? "" }
        : null,
    associateDeans: bySchool.get(row.id) ?? [],
    memberCount: memberCounts.get(row.id) ?? 0,
  }));
}

/**
 * Accounts matching what has been typed.
 *
 * Searched rather than listed, for the same reason the audit log's person
 * filter is: an institute has thousands of accounts.
 */
export async function searchUsers(
  query: string,
  limit = 10,
): Promise<SchoolPerson[]> {
  const trimmed = query.trim();
  const pattern = `%${trimmed}%`;

  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      trimmed
        ? or(ilike(user.name, pattern), ilike(user.email, pattern))
        : undefined,
    )
    .orderBy(asc(user.name))
    .limit(limit);
}

/**
 * The associate deans of the school an applicant belongs to.
 *
 * This is who a dean may hand an application on to, so it is resolved from the
 * applicant's own school rather than from anything they typed on the form.
 */
export async function associateDeansOfSchool(
  schoolId: string,
): Promise<SchoolPerson[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(schoolAssociateDean)
    .innerJoin(user, eq(user.id, schoolAssociateDean.userId))
    .where(eq(schoolAssociateDean.schoolId, schoolId))
    .orderBy(asc(user.name));
}

/**
 * Everyone holding a role, as pickable people.
 *
 * Used where the candidates are not tied to a school. Bounded by the size of
 * one role, not by the size of the institute.
 */
export async function holdersOfRole(roleId: string): Promise<SchoolPerson[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(userRole)
    .innerJoin(user, eq(user.id, userRole.userId))
    .where(and(eq(userRole.roleId, roleId), eq(user.disabled, false)))
    .orderBy(asc(user.name));
}

/**
 * The people attached to one school: whoever signs for it, and whoever names
 * it as their own.
 *
 * Both halves matter. A dean is attached to a school by the posting rather
 * than by their account, and an HR officer sitting inside a school is attached
 * by their account rather than by any posting - a step scoped to the
 * applicant's school means "the people of that school" and should not have to
 * care which of the two made them one.
 */
export async function peopleOfSchool(schoolId: string): Promise<Set<string>> {
  const [signatories, members] = await Promise.all([
    db
      .select({ id: user.id })
      .from(schoolAssociateDean)
      .innerJoin(user, eq(user.id, schoolAssociateDean.userId))
      .where(eq(schoolAssociateDean.schoolId, schoolId)),
    db.select({ id: user.id }).from(user).where(eq(user.schoolId, schoolId)),
  ]);

  const dean = await db
    .select({ id: school.deanId })
    .from(school)
    .where(eq(school.id, schoolId))
    .limit(1);

  const ids = new Set<string>();
  for (const row of [...signatories, ...members]) ids.add(row.id);
  if (dean[0]?.id) ids.add(dean[0].id);
  return ids;
}

/**
 * Everyone holding a role, narrowed to one school.
 *
 * Resolved as two questions rather than one join, because "attached to a
 * school" is two different relationships and neither of them is the role.
 */
export async function holdersOfRoleInSchool(
  roleId: string,
  schoolId: string | null,
): Promise<SchoolPerson[]> {
  // An applicant with no school has no school's dean; offering the whole role
  // instead would defeat the point of scoping the step.
  if (!schoolId) return [];

  const [holders, attached] = await Promise.all([
    holdersOfRole(roleId),
    peopleOfSchool(schoolId),
  ]);
  return holders.filter((person) => attached.has(person.id));
}

/**
 * The schools one person is attached to, for a session to carry.
 *
 * Their own school counts alongside the ones they sign for: it is what lets a
 * school-scoped step reach an officer posted inside a school without anybody
 * having to name them dean of it.
 */
export async function schoolsOf(userId: string): Promise<string[]> {
  const [own, associate, dean] = await Promise.all([
    db
      .select({ schoolId: user.schoolId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    db
      .select({ schoolId: schoolAssociateDean.schoolId })
      .from(schoolAssociateDean)
      .where(eq(schoolAssociateDean.userId, userId)),
    db
      .select({ schoolId: school.id })
      .from(school)
      .where(eq(school.deanId, userId)),
  ]);

  const ids = new Set<string>();
  if (own[0]?.schoolId) ids.add(own[0].schoolId);
  for (const row of [...associate, ...dean]) ids.add(row.schoolId);
  return Array.from(ids);
}

/** Which of these people hold the given role. */
export async function usersHoldingRole(
  roleId: string,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const rows = await db
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(and(eq(userRole.roleId, roleId), inArray(userRole.userId, userIds)));

  return new Set(rows.map((row) => row.userId));
}
