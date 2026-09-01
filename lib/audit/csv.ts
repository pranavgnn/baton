import { auditActionLabel } from "@/lib/audit/actions";

/** The shape the export needs, kept free of the database row type. */
export type AuditCsvRow = {
  createdAt: Date | string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  summary: string;
  targetType: string | null;
  targetLabel: string | null;
  applicationId: string | null;
  ipAddress: string | null;
};

const COLUMNS = [
  "Timestamp",
  "Action",
  "Action key",
  "Actor",
  "Actor email",
  "Summary",
  "Target type",
  "Target",
  "Application",
  "IP address",
] as const;

/**
 * Escapes one value for CSV.
 *
 * A field is quoted whenever it contains a delimiter, a quote or a newline,
 * and embedded quotes are doubled - the rule spreadsheets expect. A value that
 * begins with a formula character is prefixed with a quote first, so a summary
 * someone typed cannot execute when the file is opened in Excel.
 */
export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/** The whole export, header row included. */
export function auditCsv(rows: readonly AuditCsvRow[]): string {
  const lines = [COLUMNS.join(",")];

  for (const row of rows) {
    lines.push(
      [
        escapeCsv(
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
        ),
        escapeCsv(auditActionLabel(row.action)),
        escapeCsv(row.action),
        escapeCsv(row.actorName),
        escapeCsv(row.actorEmail),
        escapeCsv(row.summary),
        escapeCsv(row.targetType),
        escapeCsv(row.targetLabel),
        escapeCsv(row.applicationId),
        escapeCsv(row.ipAddress),
      ].join(","),
    );
  }

  return lines.join("\r\n");
}
