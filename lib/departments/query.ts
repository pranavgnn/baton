import "server-only";

import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { department, departmentDeputy, user, userRole } from "@/lib/db/schema";

export type DepartmentPerson = { id: string; name: string; email: string };

export type DepartmentRecord = {
  id: string;
  name: string;
  code: string;
  head: DepartmentPerson | null;
  deputies: DepartmentPerson[];
  /** How many people give this as their department. */
  memberCount: number;
};

/** Every department, with the people who sign for it. */
export async function listDepartments(): Promise<DepartmentRecord[]> {
  // A proper alias: the query joins the user table for the head while the
  // count below reads it as itself.
  const head = alias(user, "head");

  const [departments, deputies, counts] = await Promise.all([
    db
      .select({
        id: department.id,
        name: department.name,
        code: department.code,
        headId: department.headId,
        headName: head.name,
        headEmail: head.email,
      })
      .from(department)
      .leftJoin(head, eq(head.id, department.headId))
      .orderBy(asc(department.name)),

    db
      .select({
        departmentId: departmentDeputy.departmentId,
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(departmentDeputy)
      .innerJoin(user, eq(user.id, departmentDeputy.userId))
      .orderBy(asc(user.name)),

    db
      .select({
        departmentId: user.departmentId,
        total: sql<number>`count(*)::int`,
      })
      .from(user)
      .groupBy(user.departmentId),
  ]);

  const byDepartment = new Map<string, DepartmentPerson[]>();
  for (const row of deputies) {
    const list = byDepartment.get(row.departmentId) ?? [];
    list.push({ id: row.id, name: row.name, email: row.email });
    byDepartment.set(row.departmentId, list);
  }

  const memberCounts = new Map(
    counts
      .filter((row): row is { departmentId: string; total: number } =>
        Boolean(row.departmentId),
      )
      .map((row) => [row.departmentId, row.total]),
  );

  return departments.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    head:
      row.headId && row.headName
        ? { id: row.headId, name: row.headName, email: row.headEmail ?? "" }
        : null,
    deputies: byDepartment.get(row.id) ?? [],
    memberCount: memberCounts.get(row.id) ?? 0,
  }));
}

/**
 * Accounts matching what has been typed.
 *
 * Searched rather than listed, for the same reason the audit log's person
 * filter is: an organisation has thousands of accounts.
 */
export async function searchUsers(
  query: string,
  limit = 10,
): Promise<DepartmentPerson[]> {
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
 * The deputies of the department an applicant belongs to.
 *
 * This is who a head may hand an application on to, so it is resolved from the
 * applicant's own department rather than from anything they typed on the form.
 */
export async function deputiesOfDepartment(
  departmentId: string,
): Promise<DepartmentPerson[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(departmentDeputy)
    .innerJoin(user, eq(user.id, departmentDeputy.userId))
    .where(eq(departmentDeputy.departmentId, departmentId))
    .orderBy(asc(user.name));
}

/**
 * Everyone holding a role, as pickable people.
 *
 * Used where the candidates are not tied to a department. Bounded by the size of
 * one role, not by the size of the organisation.
 */
export async function holdersOfRole(
  roleId: string,
): Promise<DepartmentPerson[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(userRole)
    .innerJoin(user, eq(user.id, userRole.userId))
    .where(and(eq(userRole.roleId, roleId), eq(user.disabled, false)))
    .orderBy(asc(user.name));
}

/**
 * The people attached to one department: whoever signs for it, and whoever names
 * it as their own.
 *
 * Both halves matter. A head is attached to a department by the posting rather
 * than by their account, and an HR officer sitting inside a department is attached
 * by their account rather than by any posting - a step scoped to the
 * applicant's department means "the people of that department" and should not have to
 * care which of the two made them one.
 */
export async function peopleOfDepartment(
  departmentId: string,
): Promise<Set<string>> {
  const [signatories, members] = await Promise.all([
    db
      .select({ id: user.id })
      .from(departmentDeputy)
      .innerJoin(user, eq(user.id, departmentDeputy.userId))
      .where(eq(departmentDeputy.departmentId, departmentId)),
    db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.departmentId, departmentId)),
  ]);

  const head = await db
    .select({ id: department.headId })
    .from(department)
    .where(eq(department.id, departmentId))
    .limit(1);

  const ids = new Set<string>();
  for (const row of [...signatories, ...members]) ids.add(row.id);
  if (head[0]?.id) ids.add(head[0].id);
  return ids;
}

/**
 * Everyone holding a role, narrowed to one department.
 *
 * Resolved as two questions rather than one join, because "attached to a
 * department" is two different relationships and neither of them is the role.
 */
export async function holdersOfRoleInDepartment(
  roleId: string,
  departmentId: string | null,
): Promise<DepartmentPerson[]> {
  // An applicant with no department has no department's head; offering the whole role
  // instead would defeat the point of scoping the step.
  if (!departmentId) return [];

  const [holders, attached] = await Promise.all([
    holdersOfRole(roleId),
    peopleOfDepartment(departmentId),
  ]);
  return holders.filter((person) => attached.has(person.id));
}

/**
 * The departments one person is attached to, for a session to carry.
 *
 * Their own department counts alongside the ones they sign for: it is what lets a
 * department-scoped step reach an officer posted inside a department without anybody
 * having to name them head of it.
 */
export async function departmentsOf(userId: string): Promise<string[]> {
  const [own, deputy, head] = await Promise.all([
    db
      .select({ departmentId: user.departmentId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    db
      .select({ departmentId: departmentDeputy.departmentId })
      .from(departmentDeputy)
      .where(eq(departmentDeputy.userId, userId)),
    db
      .select({ departmentId: department.id })
      .from(department)
      .where(eq(department.headId, userId)),
  ]);

  const ids = new Set<string>();
  if (own[0]?.departmentId) ids.add(own[0].departmentId);
  for (const row of [...deputy, ...head]) ids.add(row.departmentId);
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
