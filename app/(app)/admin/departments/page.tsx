import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { listDepartments } from "@/lib/departments/query";
import { DepartmentsManager } from "./departments-manager";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await requirePermission("users.manage");

  const departments = await listDepartments();

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle">
            Each department has one head and any number of deputies. An
            application goes to the head of the applicant&rsquo;s department
            first.
          </p>
        </div>
      </div>

      <DepartmentsManager departments={departments} />
    </div>
  );
}
