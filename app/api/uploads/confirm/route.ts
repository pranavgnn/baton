import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applicationFile } from "@/lib/db/schema";
import { objectSize } from "@/lib/storage/s3";

const bodySchema = z.object({ id: z.string().min(1) });

/**
 * Called once the browser's direct-to-bucket PUT succeeds. The object is
 * checked to actually exist before the record is trusted, so a client cannot
 * attach a file reference that was never uploaded.
 */
export async function POST(request: Request) {
  const current = await getCurrentUser();
  if (!current || current.disabled) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const record = await db.query.applicationFile.findFirst({
    where: and(
      eq(applicationFile.id, parsed.data.id),
      eq(applicationFile.uploadedBy, current.id),
    ),
  });
  if (!record) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }

  const size = await objectSize(record.objectKey);
  if (size === null) {
    return NextResponse.json(
      { error: "The upload did not reach storage. Please try again." },
      { status: 409 },
    );
  }

  await db
    .update(applicationFile)
    .set({ confirmed: true, size })
    .where(eq(applicationFile.id, record.id));

  return NextResponse.json({
    id: record.id,
    key: record.objectKey,
    name: record.fileName,
    size,
    contentType: record.contentType,
  });
}
