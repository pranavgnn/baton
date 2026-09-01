/**
 * Presentation helpers shared by server and client components.
 *
 * These deliberately live outside any `"use client"` module: Next.js turns the
 * exports of a client module into client references, so a server component
 * calling one throws at render time.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DATE = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "4 Mar 2026". Null-tolerant so a column can render an em dash instead. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return DATE.format(new Date(value));
}

/** "4 Mar 2026, 11:30 am", for anything where the hour matters. */
export function formatDateTime(
  value: Date | string | null | undefined,
): string {
  if (!value) return "—";
  return DATE_TIME.format(new Date(value));
}
