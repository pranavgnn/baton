import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { role, userRole } from "@/lib/db/schema";
import { RolesManager } from "./roles-manager";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  await requirePermission("roles.manage");

  const rows = await db
    .select({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      priority: role.priority,
      isSystem: role.isSystem,
      designation: role.designation,
      memberCount: count(userRole.userId),
    })
    .from(role)
    .leftJoin(userRole, eq(userRole.roleId, role.id))
    .groupBy(role.id)
    .orderBy(role.priority, role.name);

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles</h1>
          <p className="page-subtitle">
            Roles are fully dynamic. Create the ones your process needs and
            grant each the capabilities it should have.
          </p>
        </div>
      </div>

      <RolesManager
        roles={rows.map((row) => ({
          ...row,
          description: row.description ?? "",
          permissions: row.permissions ?? [],
          designation: row.designation ?? "",
        }))}
      />
    </div>
  );
}
