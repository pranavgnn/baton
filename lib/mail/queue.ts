import { Kafka, logLevel, type Producer } from "kafkajs";

import { env } from "@/lib/env";
import { EMAIL_TOPIC, type EmailJob } from "./job";

export {
  EMAIL_CONSUMER_GROUP,
  EMAIL_TOPIC,
  emailJobSchema,
  type EmailJob,
} from "./job";

/**
 * Email delivery is asynchronous: a workflow transition publishes a job and
 * returns immediately. A slow or unreachable mail server must never hold up a
 * review, and an email step never sits between two stages of the graph.
 */

const globalForKafka = globalThis as unknown as {
  __kafka?: Kafka;
  __emailProducer?: Producer;
  __emailProducerReady?: Promise<void>;
};

export function kafka(): Kafka {
  if (!globalForKafka.__kafka) {
    globalForKafka.__kafka = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: env.KAFKA_BROKERS.split(",").map((broker) => broker.trim()),
      logLevel: logLevel.ERROR,
      retry: { retries: 3, initialRetryTime: 200 },
    });
  }
  return globalForKafka.__kafka;
}

function producer(): Producer {
  if (!globalForKafka.__emailProducer) {
    globalForKafka.__emailProducer = kafka().producer({
      allowAutoTopicCreation: true,
    });
  }
  return globalForKafka.__emailProducer;
}

/** Connects once per process; concurrent callers share the same attempt. */
async function connectedProducer(): Promise<Producer> {
  const instance = producer();
  if (!globalForKafka.__emailProducerReady) {
    globalForKafka.__emailProducerReady = instance.connect().catch((error) => {
      // Let the next caller retry rather than caching a failed connection.
      globalForKafka.__emailProducerReady = undefined;
      throw error;
    });
  }
  await globalForKafka.__emailProducerReady;
  return instance;
}

export type PublishResult =
  { ok: true; published: number } | { ok: false; error: string };

/**
 * Publishes email jobs. Never throws: a broker outage is recorded against the
 * application instead of stranding it mid-workflow.
 */
export async function publishEmailJobs(
  jobs: EmailJob[],
): Promise<PublishResult> {
  if (jobs.length === 0) return { ok: true, published: 0 };

  try {
    const instance = await connectedProducer();
    await instance.send({
      topic: EMAIL_TOPIC,
      messages: jobs.map((job) => ({
        // Partitioning by application keeps one application's mail in order.
        key: job.applicationId,
        value: JSON.stringify(job),
      })),
    });
    return { ok: true, published: jobs.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[email-queue] publish failed:", message);
    return { ok: false, error: message };
  }
}

export async function disconnectEmailProducer(): Promise<void> {
  if (!globalForKafka.__emailProducer) return;
  await globalForKafka.__emailProducer.disconnect().catch(() => undefined);
  globalForKafka.__emailProducer = undefined;
  globalForKafka.__emailProducerReady = undefined;
}
