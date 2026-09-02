import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

import { db } from "@/lib/db";
import { auditLog, type AuditLog } from "@/lib/db/schema";

export type AuditFilters = {
  /** Empty means every action. */
  actions?: string[];
  actorId?: string | null;
  /** Matches the summary, the actor and the target. */
  search?: string;
  /** Inclusive, ISO date (yyyy-mm-dd) as the filter form supplies it. */
  from?: string | null;
  to?: string | null;
};

export type AuditPage = {
  rows: AuditLog[];
  total: number;
};

/** Hard ceiling on one export, so a year of history cannot exhaust memory. */
export const AUDIT_EXPORT_LIMIT = 10_000;

function conditions(filters: AuditFilters): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];

  if (filters.actions?.length) {
    clauses.push(inArray(auditLog.action, filters.actions));
  }
  if (filters.actorId) {
    clauses.push(eq(auditLog.actorId, filters.actorId));
  }
  if (filters.from) {
    clauses.push(gte(auditLog.createdAt, new Date(`${filters.from}T00:00:00`)));
  }
  if (filters.to) {
    // The filter names a day, and the whole of that day belongs to it.
    clauses.push(
      lte(auditLog.createdAt, new Date(`${filters.to}T23:59:59.999`)),
    );
  }

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    clauses.push(
      or(
        ilike(auditLog.summary, pattern),
        ilike(auditLog.actorName, pattern),
        ilike(auditLog.actorEmail, pattern),
        ilike(auditLog.targetLabel, pattern),
        ilike(auditLog.applicationId, pattern),
      ),
    );
  }

  const present = clauses.filter((clause): clause is SQL => Boolean(clause));
  return present.length > 0 ? and(...present) : undefined;
}

/**
 * One page of history, newest first.
 *
 * Unlike the other lists in the portal this paginates in the query rather than
 * in the browser: the audit log is the one table that grows without bound, so
 * it can never be loaded whole.
 */
export async function listAuditLog(
  filters: AuditFilters,
  page: { index: number; size: number },
): Promise<AuditPage> {
  const where = conditions(filters);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(page.size)
      .offset(page.index * page.size),
    db.select({ value: count() }).from(auditLog).where(where),
  ]);

  return { rows, total: totals[0]?.value ?? 0 };
}

/** Every row matching the filters, for the CSV export. */
export async function listAuditForExport(
  filters: AuditFilters,
): Promise<AuditLog[]> {
  return db
    .select()
    .from(auditLog)
    .where(conditions(filters))
    .orderBy(desc(auditLog.createdAt))
    .limit(AUDIT_EXPORT_LIMIT);
}

export type AuditActor = { id: string; name: string; email: string | null };

/**
 * Actors matching what has been typed, newest activity first.
 *
 * Deliberately not "every user": an institute has thousands, and a select
 * holding all of them is unusable. The search is over who actually appears in
 * the log, and always bounded.
 */
export async function searchAuditActors(
  query: string,
  limit = 10,
): Promise<AuditActor[]> {
  const trimmed = query.trim();

  const rows = await db
    .selectDistinct({
      id: auditLog.actorId,
      name: auditLog.actorName,
      email: auditLog.actorEmail,
    })
    .from(auditLog)
    .where(
      trimmed
        ? and(
            isNotNull(auditLog.actorId),
            or(
              ilike(auditLog.actorName, `%${trimmed}%`),
              ilike(auditLog.actorEmail, `%${trimmed}%`),
            ),
          )
        : isNotNull(auditLog.actorId),
    )
    .limit(limit);

  return rows
    .filter((row): row is AuditActor & { id: string; name: string } =>
      Boolean(row.id && row.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One actor by id, so a filter restored from a URL can name who it means. */
export async function findAuditActor(id: string): Promise<AuditActor | null> {
  const [row] = await db
    .selectDistinct({
      id: auditLog.actorId,
      name: auditLog.actorName,
      email: auditLog.actorEmail,
    })
    .from(auditLog)
    .where(eq(auditLog.actorId, id))
    .limit(1);

  if (!row?.id || !row.name) return null;
  return { id: row.id, name: row.name, email: row.email };
}
