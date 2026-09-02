import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden, redirect, unauthorized } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import {
  grants,
  grantsAny,
  SUPER_ADMIN_PERMISSION,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { role, school, user, userRole } from "@/lib/db/schema";
import { schoolsOf } from "@/lib/schools/query";

export type SessionRole = {
  id: string;
  name: string;
  permissions: string[];
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  employeeId: string | null;
  schoolId: string | null;
  schoolName: string | null;
  /**
   * Every school this person is attached to: their own, and any they sign for
   * as dean or associate dean. It is what a school-scoped stage is matched
   * against, so a dean sees the applications of their own school and not of
   * every school with a dean.
   */
  schoolIds: string[];
  designation: string | null;
  activated: boolean;
  disabled: boolean;
  roles: SessionRole[];
  roleIds: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  /**
   * Set while an administrator is acting as this person: who they really are.
   * Null in the ordinary case, which is every case but that one.
   */
  impersonatedBy: { id: string; name: string; email: string } | null;
};

/** Everything a session needs to know about one account. */
async function loadUser(id: string): Promise<CurrentUser | null> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      schoolId: user.schoolId,
      schoolName: school.name,
      designation: user.designation,
      activated: user.activated,
      disabled: user.disabled,
      roleId: role.id,
      roleName: role.name,
      rolePermissions: role.permissions,
    })
    .from(user)
    .leftJoin(school, eq(school.id, user.schoolId))
    .leftJoin(userRole, eq(userRole.userId, user.id))
    .leftJoin(role, eq(role.id, userRole.roleId))
    .where(eq(user.id, id));

  const first = rows[0];
  if (!first) return null;

  const schoolIds = await schoolsOf(id);

  const roles: SessionRole[] = [];
  for (const row of rows) {
    if (row.roleId && row.roleName) {
      roles.push({
        id: row.roleId,
        name: row.roleName,
        permissions: row.rolePermissions ?? [],
      });
    }
  }

  const permissions = Array.from(new Set(roles.flatMap((r) => r.permissions)));

  return {
    id: first.id,
    name: first.name,
    email: first.email,
    employeeId: first.employeeId,
    schoolId: first.schoolId,
    schoolName: first.schoolName,
    schoolIds,
    designation: first.designation,
    activated: first.activated,
    disabled: first.disabled,
    roles,
    roleIds: roles.map((r) => r.id),
    permissions,
    isSuperAdmin: permissions.includes(SUPER_ADMIN_PERMISSION),
    impersonatedBy: null,
  };
}

/**
 * Whoever is signed in, or the person an administrator is currently acting as.
 *
 * Deduplicated per request so a page and its nested layouts share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const current = await loadUser(session.user.id);
  if (!current) return null;

  // The session itself says whose it is: the admin plugin swaps the session
  // rather than dressing one up, so everything downstream sees the
  // impersonated person without knowing anything about impersonation.
  const behindIt = session.session.impersonatedBy;
  if (!behindIt) return current;

  const real = await loadUser(behindIt);
  if (!real) return current;

  return {
    ...current,
    impersonatedBy: { id: real.id, name: real.name, email: real.email },
  };
});

/**
 * The administrator behind the session, ignoring who they are acting as.
 *
 * Used where the answer must be about the person at the keyboard: ending an
 * impersonation, and recording who really did something.
 */
export async function getRealUser(): Promise<CurrentUser | null> {
  const current = await getCurrentUser();
  if (!current?.impersonatedBy) return current;
  return loadUser(current.impersonatedBy.id);
}

/** Redirects unauthenticated visitors to the sign-in page. */
export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");
  if (current.disabled) redirect("/account-disabled");
  return current;
}

export async function requirePermission(
  permission: PermissionKey,
): Promise<CurrentUser> {
  const current = await requireUser();
  if (!grants(current.permissions, permission)) forbidden();
  return current;
}

export async function requireAnyPermission(
  permissions: readonly PermissionKey[],
): Promise<CurrentUser> {
  const current = await requireUser();
  if (!grantsAny(current.permissions, permissions)) forbidden();
  return current;
}

/** Server-action variant: throws instead of rendering an error page. */
export async function requireUserAction(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) throw new Error("You must be signed in to do that.");
  if (current.disabled) throw new Error("Your account has been disabled.");
  return current;
}

export async function requirePermissionAction(
  permission: PermissionKey,
): Promise<CurrentUser> {
  const current = await requireUserAction();
  if (!grants(current.permissions, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return current;
}

export async function requireAnyPermissionAction(
  permissions: readonly PermissionKey[],
): Promise<CurrentUser> {
  const current = await requireUserAction();
  if (!grantsAny(current.permissions, permissions)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return current;
}

export function can(
  current: CurrentUser | null,
  permission: PermissionKey,
): boolean {
  if (!current) return false;
  return grants(current.permissions, permission);
}

export function canAny(
  current: CurrentUser | null,
  permissions: readonly PermissionKey[],
): boolean {
  if (!current) return false;
  return grantsAny(current.permissions, permissions);
}

export { unauthorized, forbidden };
