import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { role, school } from "@/lib/db/schema";
import { WhitelistClient } from "./whitelist-client";

export const metadata: Metadata = { title: "Add to Whitelist" };

export default async function WhitelistPage() {
  await requirePermission("users.manage");

  const [roles, schools] = await Promise.all([
    db
      .select({ id: role.id, name: role.name })
      .from(role)
      .orderBy(role.priority, role.name),
    db
      .select({ id: school.id, name: school.name })
      .from(school)
      .orderBy(school.name),
  ]);

  return <WhitelistClient roles={roles} schools={schools} />;
}
