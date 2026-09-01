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

import { db } from "@/lib/db";
import { applicationEvent, emailTemplate } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  EMAIL_CONSUMER_GROUP,
  EMAIL_TOPIC,
  emailJobSchema,
  kafka,
  type EmailJob,
} from "@/lib/mail/queue";
import { renderTemplate } from "@/lib/mail/render";
import { sendMail } from "@/lib/mail/transport";

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

async function main() {
  const consumer = kafka().consumer({ groupId: EMAIL_CONSUMER_GROUP });

  await consumer.connect();
  await consumer.subscribe({ topic: EMAIL_TOPIC, fromBeginning: false });

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
