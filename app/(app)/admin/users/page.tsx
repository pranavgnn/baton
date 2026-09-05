import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { role, department, user, userRole } from "@/lib/db/schema";
import { UsersManager, type UserRow } from "./users-manager";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const current = await requirePermission("users.manage");
  // A link from elsewhere in the admin area - the members of a role, say -
  // arrives naming one person, and should land on that person rather than on
  // page one of everybody.
  const { person } = await searchParams;

  const [rows, roles, departments] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        departmentId: user.departmentId,
        departmentName: department.name,
        designation: user.designation,
        institution: user.institution,
        userType: user.userType,
        dateOfBirth: user.dateOfBirth,
        dateOfJoining: user.dateOfJoining,
        dateOfLastPromotion: user.dateOfLastPromotion,
        phone: user.phone,
        personalEmail: user.personalEmail,
        address: user.address,
        activated: user.activated,
        disabled: user.disabled,
        createdAt: user.createdAt,
        roleId: role.id,
        roleName: role.name,
      })
      .from(user)
      .leftJoin(department, eq(department.id, user.departmentId))
      .leftJoin(userRole, eq(userRole.userId, user.id))
      .leftJoin(role, eq(role.id, userRole.roleId))
      .orderBy(user.name),
    db.select().from(role).orderBy(role.priority, role.name),
    db.select().from(department).orderBy(department.name),
  ]);

  const byId = new Map<string, UserRow>();
  for (const row of rows) {
    const entry = byId.get(row.id) ?? {
      id: row.id,
      name: row.name,
      email: row.email,
      employeeId: row.employeeId ?? "",
      departmentId: row.departmentId ?? "",
      departmentName: row.departmentName ?? "",
      designation: row.designation ?? "",
      institution: row.institution ?? "",
      userType: row.userType ?? "",
      dateOfBirth: row.dateOfBirth ?? "",
      dateOfJoining: row.dateOfJoining ?? "",
      dateOfLastPromotion: row.dateOfLastPromotion ?? "",
      phone: row.phone ?? "",
      personalEmail: row.personalEmail ?? "",
      address: row.address ?? "",
      activated: row.activated,
      disabled: row.disabled,
      createdAt: row.createdAt.toISOString(),
      roles: [],
    };
    if (row.roleId && row.roleName) {
      entry.roles.push({ id: row.roleId, name: row.roleName });
    }
    byId.set(row.id, entry);
  }

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            The portal is whitelist-only. Add an institute address here and the
            holder activates it from the emailed link.
          </p>
        </div>
      </div>

      <UsersManager
        users={Array.from(byId.values())}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        departments={departments.map((s) => ({ id: s.id, name: s.name }))}
        currentUserId={current.id}
        openEmail={typeof person === "string" ? person : null}
      />
    </div>
  );
}
