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
