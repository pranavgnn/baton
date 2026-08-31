import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applicationFile } from "@/lib/db/schema";
import { buildObjectKey, presignUpload } from "@/lib/storage/s3";

/**
 * Hard ceiling applied on top of whatever the field's own validation allows,
 * so a tampered client cannot ask for a pre-signed URL for a huge object.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export async function POST(request: Request) {
  const current = await getCurrentUser();
  if (!current || current.disabled) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "That file cannot be uploaded.",
      },
      { status: 400 },
    );
  }

  const { fileName, contentType, size } = parsed.data;
  const objectKey = buildObjectKey({ userId: current.id, fileName });

  const id = crypto.randomUUID();
  await db.insert(applicationFile).values({
    id,
    applicationId: null,
    objectKey,
    fileName,
    contentType,
    size,
    uploadedBy: current.id,
    confirmed: false,
  });

  const uploadUrl = await presignUpload({
    objectKey,
    contentType,
    contentLength: size,
  });

  return NextResponse.json({ id, objectKey, uploadUrl });
}
