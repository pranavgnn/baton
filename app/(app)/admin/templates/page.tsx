import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailTemplate } from "@/lib/db/schema";
import { TemplatesManager } from "./templates-manager";

export const metadata: Metadata = { title: "Email templates" };

export default async function TemplatesPage() {
  await requirePermission("templates.manage");

  const templates = await db
    .select()
    .from(emailTemplate)
    .orderBy(emailTemplate.name);

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email templates</h1>
          <p className="page-subtitle">
            Templates are hydrated with live application data whenever the
            workflow reaches a Send Email step.
          </p>
        </div>
      </div>

      <TemplatesManager
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          subject: template.subject,
          description: template.description ?? "",
          bodyHtml: template.bodyHtml,
          updatedAt: template.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
