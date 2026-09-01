import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { listAuditActors, listAuditLog } from "@/lib/audit/query";
import { AuditTable } from "./audit-table";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

/** Reads one search param, tolerating the array form Next.js can hand back. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  await requirePermission("audit.view");

  const params = await searchParams;

  const actions = single(params.actions)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const filters = {
    actions,
    actorId: single(params.actor) || null,
    search: single(params.q),
    from: single(params.from) || null,
    to: single(params.to) || null,
  };

  const requestedSize = Number(single(params.size));
  const size = PAGE_SIZES.includes(requestedSize)
    ? requestedSize
    : DEFAULT_PAGE_SIZE;
  const index = Math.max(0, Number(single(params.page) || "0") || 0);

  const [{ rows, total }, actors] = await Promise.all([
    listAuditLog(filters, { index, size }),
    listAuditActors(),
  ]);

  return (
    <div className="app-shell-wide section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="page-subtitle">
            Every action taken in the portal, newest first. Entries are never
            edited or removed.
          </p>
        </div>
      </div>

      <AuditTable
        rows={rows.map((row) => ({
          id: row.id,
          action: row.action,
          actorName: row.actorName,
          actorEmail: row.actorEmail,
          summary: row.summary,
          targetType: row.targetType,
          targetLabel: row.targetLabel,
          applicationId: row.applicationId,
          ipAddress: row.ipAddress,
          createdAt: row.createdAt.toISOString(),
        }))}
        total={total}
        page={index}
        pageSize={size}
        pageSizes={PAGE_SIZES}
        actors={actors}
        filters={filters}
      />
    </div>
  );
}
