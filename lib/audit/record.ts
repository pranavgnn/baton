import { headers } from "next/headers";

import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import type { AuditAction } from "@/lib/audit/actions";

export type AuditActor = {
  id: string;
  name: string;
  email: string;
};

export type AuditEntry = {
  action: AuditAction;
  /** Who did it. Omitted only where there is genuinely no session yet. */
  actor?: AuditActor | null;
  /** One line, written for someone reading the table, not for a developer. */
  summary: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  applicationId?: string;
  detail?: Record<string, unknown>;
};

/**
 * Writes one entry.
 *
 * Never throws. An audit row failing to write must not fail the action it was
 * recording: losing the record of a password change is bad, refusing the
 * password change because of it is worse. A failure is logged to the server
 * console so it is not silent.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const origin = await requestOrigin();

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      action: entry.action,
      actorId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? null,
      actorEmail: entry.actor?.email ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      applicationId: entry.applicationId ?? null,
      summary: entry.summary,
      detail: entry.detail ?? {},
      ipAddress: origin.ipAddress,
      userAgent: origin.userAgent,
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}

/**
 * Where the action came from, when there is a request to ask.
 *
 * Seeding and the email worker record entries with no request around them, and
 * an audit entry without an address is still worth having.
 */
async function requestOrigin(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const requestHeaders = await headers();
    return {
      ipAddress: clientAddress(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * The caller's address as far as it can be trusted.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded header is
 * preferred - its first entry, since anything after it was appended by hops
 * closer to us.
 */
function clientAddress(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return requestHeaders.get("x-real-ip");
}
