"use server";

import { failFrom, ok, type ActionResult } from "@/lib/actions";
import { requirePermissionAction } from "@/lib/auth/session";
import { auditCsv } from "@/lib/audit/csv";
import {
  listAuditForExport,
  searchAuditActors,
  AUDIT_EXPORT_LIMIT,
  type AuditActor,
  type AuditFilters,
} from "@/lib/audit/query";

export type AuditExport = {
  csv: string;
  rows: number;
  /** True when the export stopped at the ceiling and more history matched. */
  truncated: boolean;
};

/**
 * Builds the CSV for whatever the filters currently select.
 *
 * The file is handed back as text for the browser to save rather than served
 * from a route: the export is a privileged read, and going through an action
 * keeps it behind the same permission check as the table itself.
 */
export async function exportAuditLog(
  filters: AuditFilters,
): Promise<ActionResult<AuditExport>> {
  try {
    await requirePermissionAction("audit.view");

    const rows = await listAuditForExport(filters);

    return ok({
      csv: auditCsv(rows),
      rows: rows.length,
      truncated: rows.length === AUDIT_EXPORT_LIMIT,
    });
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * People to choose from in the actor filter, matching what has been typed.
 *
 * Searched rather than listed: the portal is meant for an organisation, so a
 * select holding every account would be thousands long and useless.
 */
export async function findAuditActors(
  query: string,
): Promise<ActionResult<{ actors: AuditActor[] }>> {
  try {
    await requirePermissionAction("audit.view");
    return ok({ actors: await searchAuditActors(query) });
  } catch (error) {
    return failFrom(error);
  }
}
