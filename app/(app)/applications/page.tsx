import type { Metadata } from "next";

import { listAllApplications } from "@/lib/applications/service";
import { requirePermission } from "@/lib/auth/session";
import { nodeById } from "@/lib/workflow/graph";
import { ApplicationsTable, type ApplicationRow } from "./applications-table";

export const metadata: Metadata = { title: "All applications" };

export default async function ApplicationsPage() {
  await requirePermission("applications.viewAll");
  const applications = await listAllApplications();

  const rows: ApplicationRow[] = applications.map((app) => ({
    id: app.id,
    reference: app.reference,
    status: app.status,
    applicantName: app.applicant.name,
    applicantEmail: app.applicant.email,
    department: app.applicant.department ?? "",
    stage: nodeById(app.graph, app.currentNodeId)?.data.label ?? "-",
    submittedAt: app.submittedAt?.toISOString() ?? null,
    updatedAt: app.updatedAt.toISOString(),
  }));

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">All applications</h1>
          <p className="page-subtitle">
            Every promotion application on record, whatever stage it is at.
          </p>
        </div>
      </div>

      <ApplicationsTable applications={rows} />
    </div>
  );
}
