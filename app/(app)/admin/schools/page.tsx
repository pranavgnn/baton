import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { listSchools } from "@/lib/schools/query";
import { SchoolsManager } from "./schools-manager";

export const metadata: Metadata = { title: "Schools" };

export default async function SchoolsPage() {
  await requirePermission("users.manage");

  const schools = await listSchools();

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Schools</h1>
          <p className="page-subtitle">
            Each school has one dean and any number of associate deans. A
            promotion application goes to the dean of the applicant&rsquo;s
            school first.
          </p>
        </div>
      </div>

      <SchoolsManager schools={schools} />
    </div>
  );
}
