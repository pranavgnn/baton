import { z } from "zod";

/**
 * The contract between the workflow and the email worker.
 *
 * Kept free of the Kafka client and of `env` so both sides - and the tests -
 * can depend on the shape without booting any infrastructure.
 */

export const EMAIL_TOPIC = "baton.emails";
export const EMAIL_CONSUMER_GROUP = "baton-email-worker";

export const emailJobSchema = z.object({
  /** Stable per (application, node, attempt) so a redelivery is recognisable. */
  id: z.string().min(1),
  applicationId: z.string().min(1),
  /** The email node that produced this job. */
  nodeId: z.string().min(1),
  nodeLabel: z.string(),
  templateId: z.string().min(1),
  recipients: z.array(z.email()).min(1),
  /**
   * Values for the template's `{{placeholders}}`, resolved at publish time so
   * the message reflects the application as it was when the step ran.
   */
  variables: z.record(z.string(), z.string()),
});

export type EmailJob = z.infer<typeof emailJobSchema>;
