/**
 * Delivers the email the workflow queues.
 *
 * Workflow transitions publish a job and return, so a slow or unreachable mail
 * server never holds up a review. This process renders the admin-authored
 * template, sends it, and records the outcome against the application.
 *
 *   pnpm worker
 */
import { eq } from "drizzle-orm";

import { recordAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { applicationEvent, emailTemplate } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  EMAIL_CONSUMER_GROUP,
  EMAIL_TOPIC,
  emailJobSchema,
  ensureEmailTopic,
  kafka,
  type EmailJob,
} from "@/lib/mail/queue";
import { renderTemplate } from "@/lib/mail/render";
import { sendMail } from "@/lib/mail/transport";

/**
 * Records what became of one message, in both places it belongs: against the
 * application for anyone reading its file, and in the audit log, which is
 * where "was that person ever told" is actually asked.
 */
async function record(
  job: EmailJob,
  type: "email_sent" | "email_failed",
  note: string,
) {
  await db.insert(applicationEvent).values({
    id: crypto.randomUUID(),
    applicationId: job.applicationId,
    type,
    nodeId: job.nodeId,
    nodeLabel: job.nodeLabel,
    actorId: null,
    actorName: null,
    note,
    detail: { recipients: job.recipients, jobId: job.id },
  });

  const reference = job.variables.application_reference ?? job.applicationId;
  await recordAudit({
    action:
      type === "email_sent"
        ? "application.email_delivered"
        : "application.email_failed",
    summary:
      type === "email_sent"
        ? `Delivered "${job.nodeLabel}" for ${reference} to ${job.recipients.join(", ")}.`
        : `Failed to deliver "${job.nodeLabel}" for ${reference}: ${note}`,
    targetType: "application",
    targetId: job.applicationId,
    targetLabel: reference,
    applicationId: job.applicationId,
    detail: { step: job.nodeLabel, recipients: job.recipients, jobId: job.id },
  });
}

async function handle(raw: string) {
  const parsed = emailJobSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    // A malformed job can never succeed, so log and drop it rather than
    // blocking the partition behind an infinite retry.
    console.error("[worker] discarding malformed job:", parsed.error.message);
    return;
  }

  const job = parsed.data;
  const template = await db.query.emailTemplate.findFirst({
    where: eq(emailTemplate.id, job.templateId),
  });

  if (!template) {
    await record(
      job,
      "email_failed",
      "The configured template no longer exists.",
    );
    return;
  }

  const rendered = await renderTemplate({
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    variables: job.variables,
  });

  const result = await sendMail({
    to: job.recipients,
    subject: rendered.subject,
    html: rendered.html,
  });

  if (result.ok) {
    await record(job, "email_sent", `Sent to ${job.recipients.join(", ")}`);
    console.log(
      `[worker] sent "${rendered.subject}" to ${job.recipients.join(", ")}`,
    );
  } else {
    await record(job, "email_failed", `Delivery failed: ${result.error}`);
    console.error(`[worker] delivery failed: ${result.error}`);
  }
}

/**
 * A broker that is still starting refuses connections and has no leader to
 * offer yet. Retrying beats exiting: the worker is supervised alongside the
 * app, so a crash here would take the site down with it.
 */
async function withRetries<T>(
  what: string,
  attempt: () => Promise<T>,
  tries = 10,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (i >= tries) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[worker] ${what} failed (${i}/${tries}): ${message}`);
      await new Promise((resolve) => setTimeout(resolve, i * 1000));
    }
  }
}

async function main() {
  await withRetries("topic setup", ensureEmailTopic);

  const consumer = kafka().consumer({ groupId: EMAIL_CONSUMER_GROUP });

  await withRetries("subscribe", async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: EMAIL_TOPIC, fromBeginning: false });
  });

  console.log(
    `[worker] listening on ${EMAIL_TOPIC} via ${env.KAFKA_BROKERS}, relaying to ${env.SMTP_HOST}:${env.SMTP_PORT}`,
  );

  await consumer.run({
    eachMessage: async ({ message }) => {
      const value = message.value?.toString();
      if (!value) return;
      try {
        await handle(value);
      } catch (error) {
        // Swallowing here commits the offset. The failure is already on the
        // application timeline where an admin can see it; rethrowing would
        // wedge the partition behind a job that may never succeed.
        console.error("[worker] job failed:", error);
      }
    },
  });

  const shutdown = async () => {
    await consumer.disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] could not start:", error);
  process.exit(1);
});
