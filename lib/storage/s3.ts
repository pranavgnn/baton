import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

const globalForS3 = globalThis as unknown as { __s3?: S3Client };

export function s3(): S3Client {
  if (!globalForS3.__s3) {
    globalForS3.__s3 = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      // MinIO does not support virtual-hosted-style addressing by default.
      forcePathStyle: true,
      // MinIO rejects the flexible-checksum headers the SDK now sends by
      // default, so only compute them when an operation actually requires it.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return globalForS3.__s3;
}

export const BUCKET = env.S3_BUCKET;

const UPLOAD_URL_TTL = 60 * 10; // 10 minutes
const DOWNLOAD_URL_TTL = 60 * 5; // 5 minutes

/** Deterministic, collision-free object key with the extension preserved. */
export function buildObjectKey(params: {
  userId: string;
  fileName: string;
}): string {
  const extension = params.fileName.includes(".")
    ? `.${params.fileName
        .split(".")
        .pop()!
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")}`
    : "";
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `uploads/${datePart}/${params.userId}/${crypto.randomUUID()}${extension}`;
}

/**
 * Pre-signed PUT so browsers upload straight to the bucket and large files
 * never pass through the Next.js server.
 */
export async function presignUpload(params: {
  objectKey: string;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: params.objectKey,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  const url = await getSignedUrl(s3(), command, { expiresIn: UPLOAD_URL_TTL });
  return rewriteToPublicEndpoint(url);
}

export async function presignDownload(params: {
  objectKey: string;
  fileName: string;
  inline?: boolean;
}): Promise<string> {
  const disposition = params.inline ? "inline" : "attachment";
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: params.objectKey,
    ResponseContentDisposition: `${disposition}; filename="${params.fileName.replace(/"/g, "")}"`,
  });
  const url = await getSignedUrl(s3(), command, {
    expiresIn: DOWNLOAD_URL_TTL,
  });
  return rewriteToPublicEndpoint(url);
}

export async function objectExists(objectKey: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

export async function objectSize(objectKey: string): Promise<number | null> {
  try {
    const head = await s3().send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }),
    );
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(objectKey: string): Promise<void> {
  try {
    await s3().send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey }),
    );
  } catch (error) {
    console.error("[s3] delete failed", objectKey, error);
  }
}

/**
 * The server talks to MinIO over the internal endpoint, but the signed URL has
 * to be reachable from the user's browser. Signatures cover the path and query,
 * not the host, so swapping the origin keeps the URL valid.
 */
function rewriteToPublicEndpoint(url: string): string {
  if (env.S3_ENDPOINT === env.S3_PUBLIC_ENDPOINT) return url;
  const signed = new URL(url);
  const target = new URL(env.S3_PUBLIC_ENDPOINT);
  signed.protocol = target.protocol;
  signed.host = target.host;
  return signed.toString();
}

/**
 * Idempotent bucket bootstrap, called by the seed script.
 *
 * CORS is deliberately not configured here: MinIO does not implement
 * `PutBucketCors` and instead takes the allowed origin from the
 * `MINIO_API_CORS_ALLOW_ORIGIN` environment variable set in `compose.yaml`.
 * On a real S3 deployment, configure the bucket CORS policy out of band.
 */
export async function ensureBucket(): Promise<void> {
  const client = s3();
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return;
  } catch {
    // Bucket is missing (or not visible) - fall through and create it.
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
      throw error;
    }
  }
}
