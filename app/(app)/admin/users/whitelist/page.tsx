import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { role, department } from "@/lib/db/schema";
import { WhitelistClient } from "./whitelist-client";

export const metadata: Metadata = { title: "Add to Whitelist" };

export default async function WhitelistPage() {
  await requirePermission("users.manage");

  const [roles, departments] = await Promise.all([
    db
      .select({ id: role.id, name: role.name })
      .from(role)
      .orderBy(role.priority, role.name),
    db
      .select({ id: department.id, name: department.name })
      .from(department)
      .orderBy(department.name),
  ]);

  return <WhitelistClient roles={roles} departments={departments} />;
}
