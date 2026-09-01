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
import { role, user, userRole } from "@/lib/db/schema";

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
  department: string | null;
  designation: string | null;
  activated: boolean;
  disabled: boolean;
  roles: SessionRole[];
  roleIds: string[];
  permissions: string[];
  isSuperAdmin: boolean;
};

/**
 * Deduplicated per request so a page and its nested layouts share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      department: user.department,
      designation: user.designation,
      activated: user.activated,
      disabled: user.disabled,
      roleId: role.id,
      roleName: role.name,
      rolePermissions: role.permissions,
    })
    .from(user)
    .leftJoin(userRole, eq(userRole.userId, user.id))
    .leftJoin(role, eq(role.id, userRole.roleId))
    .where(eq(user.id, session.user.id));

  const first = rows[0];
  if (!first) return null;

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
    department: first.department,
    designation: first.designation,
    activated: first.activated,
    disabled: first.disabled,
    roles,
    roleIds: roles.map((r) => r.id),
    permissions,
    isSuperAdmin: permissions.includes(SUPER_ADMIN_PERMISSION),
  };
});

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
