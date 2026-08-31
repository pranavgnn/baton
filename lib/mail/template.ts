import type { TemplateVariables } from "@/lib/workflow/types";

/**
 * Pure text transforms shared by the template editor, the workflow email
 * dispatcher and the tests. Deliberately free of React and of `env` so it can
 * be exercised without booting the app.
 */

/**
 * Replaces `{{variable}}` placeholders. Unknown placeholders are blanked out
 * rather than left visible so recipients never see raw handlebars.
 */
export function hydrate(
  input: string,
  variables: TemplateVariables | Record<string, string | undefined>,
): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = (variables as Record<string, string | undefined>)[key];
    return escapeHtml(value ?? "");
  });
}

/** Same as {@link hydrate} but for plain-text contexts such as the subject. */
export function hydrateText(
  input: string,
  variables: TemplateVariables | Record<string, string | undefined>,
): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = (variables as Record<string, string | undefined>)[key];
    return value ?? "";
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
  "pre",
  "hr",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
]);

/**
 * Template bodies come from authenticated admins, but the output is emailed to
 * third parties, so scripts and event handlers are stripped defensively.
 */
export function sanitizeTemplateHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) =>
      ALLOWED_TAGS.has(tag.toLowerCase()) ? match : "",
    );
}

/** Crude but adequate plain-text alternative for the multipart body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
