"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit/record";
import { z } from "zod";

import {
  fail,
  failFrom,
  ok,
  parseInput,
  type ActionResult,
} from "@/lib/actions";
import { requirePermissionAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailTemplate, workflow } from "@/lib/db/schema";
import { renderTemplate, sanitizeTemplateHtml } from "@/lib/mail/render";
import { sendMail } from "@/lib/mail/transport";
import { SINGLETON_WORKFLOW_ID } from "@/lib/workflow/defaults";
import { emailNodes } from "@/lib/workflow/graph";
import type { EmailTemplateDoc } from "@/lib/workflow/types";

const templateInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters")
    .max(120, "Use at most 120 characters"),
  subject: z
    .string()
    .trim()
    .min(2, "A subject line is required")
    .max(200, "Use at most 200 characters"),
  description: z.string().trim().max(280).optional().default(""),
  bodyHtml: z.string().min(1, "The message body cannot be empty"),
  bodyJson: z.unknown().optional(),
});

export type TemplateInput = z.input<typeof templateInput>;

async function assertNameFree(name: string, excludeId?: string) {
  const existing = await db.query.emailTemplate.findFirst({
    where: excludeId
      ? and(eq(emailTemplate.name, name), ne(emailTemplate.id, excludeId))
      : eq(emailTemplate.name, name),
  });
  return !existing;
}

export async function createTemplate(
  input: TemplateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const current = await requirePermissionAction("templates.manage");

    const parsed = parseInput(templateInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    if (!(await assertNameFree(parsed.data.name))) {
      return fail("A template with that name already exists.", {
        name: "That name is taken.",
      });
    }

    const id = crypto.randomUUID();
    await db.insert(emailTemplate).values({
      id,
      name: parsed.data.name,
      subject: parsed.data.subject,
      description: parsed.data.description || null,
      bodyHtml: sanitizeTemplateHtml(parsed.data.bodyHtml),
      bodyJson: (parsed.data.bodyJson as EmailTemplateDoc) ?? null,
    });

    await recordAudit({
      action: "template.created",
      actor: current,
      summary: `Created the email template "${parsed.data.name}".`,
      targetType: "template",
      targetId: id,
      targetLabel: parsed.data.name,
    });

    revalidatePath("/admin/templates");
    return ok({ id });
  } catch (error) {
    return failFrom(error);
  }
}

export async function updateTemplate(
  id: string,
  input: TemplateInput,
): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("templates.manage");

    const parsed = parseInput(templateInput, input);
    if (!parsed.ok) return fail(parsed.error, parsed.fieldErrors);

    const existing = await db.query.emailTemplate.findFirst({
      where: eq(emailTemplate.id, id),
    });
    if (!existing) return fail("That template no longer exists.");

    if (!(await assertNameFree(parsed.data.name, id))) {
      return fail("A template with that name already exists.", {
        name: "That name is taken.",
      });
    }

    await db
      .update(emailTemplate)
      .set({
        name: parsed.data.name,
        subject: parsed.data.subject,
        description: parsed.data.description || null,
        bodyHtml: sanitizeTemplateHtml(parsed.data.bodyHtml),
        bodyJson: (parsed.data.bodyJson as EmailTemplateDoc) ?? null,
      })
      .where(eq(emailTemplate.id, id));

    await recordAudit({
      action: "template.updated",
      actor: current,
      summary: `Updated the email template "${parsed.data.name}".`,
      targetType: "template",
      targetId: id,
      targetLabel: parsed.data.name,
      detail: {
        renamedFrom:
          existing.name === parsed.data.name ? undefined : existing.name,
      },
    });

    revalidatePath("/admin/templates");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("templates.manage");

    const existing = await db.query.emailTemplate.findFirst({
      where: eq(emailTemplate.id, id),
    });

    const flow = await db.query.workflow.findFirst({
      where: eq(workflow.id, SINGLETON_WORKFLOW_ID),
    });
    const usedBy = [
      ...(flow?.graph ? emailNodes(flow.graph) : []),
      ...(flow?.publishedGraph ? emailNodes(flow.publishedGraph) : []),
    ].filter((node) => node.data.templateId === id);

    if (usedBy.length > 0) {
      const labels = Array.from(new Set(usedBy.map((n) => n.data.label)));
      return fail(
        `This template is used by email step${labels.length === 1 ? "" : "s"}: ${labels.join(", ")}.`,
      );
    }

    await db.delete(emailTemplate).where(eq(emailTemplate.id, id));

    await recordAudit({
      action: "template.deleted",
      actor: current,
      summary: `Deleted the email template "${existing?.name ?? id}".`,
      targetType: "template",
      targetId: id,
      targetLabel: existing?.name,
    });

    revalidatePath("/admin/templates");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/** Sends the template to the admin's own inbox with placeholder sample data. */
export async function sendTestEmail(input: {
  subject: string;
  bodyHtml: string;
}): Promise<ActionResult> {
  try {
    const current = await requirePermissionAction("templates.manage");

    const rendered = await renderTemplate({
      subject: `[Test] ${input.subject}`,
      bodyHtml: input.bodyHtml,
      variables: {
        applicant_name: "Dr. Sample Applicant",
        applicant_email: "sample.applicant@manipal.edu",
        application_reference: "PROM-2026-0001",
        application_status: "In progress",
        current_stage: "Deputy Review",
        previous_stage: "Head Recommendation",
        last_outcome: "Recommend",
        actor_name: current.name,
        submitted_at: new Date().toLocaleString("en-IN"),
        application_url: "http://localhost:3000/applications/sample",
      },
    });

    const result = await sendMail({
      to: current.email,
      subject: rendered.subject,
      html: rendered.html,
    });

    if (!result.ok)
      return fail(`Could not send the test email: ${result.error}`);

    await recordAudit({
      action: "template.test_sent",
      actor: current,
      summary: `Sent a test email to ${current.email}.`,
      targetType: "template",
      detail: { subject: input.subject },
    });

    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
