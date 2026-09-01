import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  getApplicationById,
  canViewApplication,
} from "@/lib/applications/service";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { applicationFile } from "@/lib/db/schema";
import { presignDownload } from "@/lib/storage/s3";

/**
 * Redirects to a short-lived pre-signed GET so the bucket never has to be
 * public. Access mirrors the visibility rules of the owning application.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const current = await getCurrentUser();
  if (!current || current.disabled) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const { fileId } = await params;
  const record = await db.query.applicationFile.findFirst({
    where: eq(applicationFile.id, fileId),
  });
  if (!record) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  if (record.applicationId) {
    const app = await getApplicationById(record.applicationId);
    if (!app || !canViewApplication(app, current)) {
      return NextResponse.json({ error: "Not authorised." }, { status: 403 });
    }
  } else if (record.uploadedBy !== current.id) {
    // Still-unattached uploads are only visible to whoever uploaded them.
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const url = await presignDownload({
    objectKey: record.objectKey,
    fileName: record.fileName,
    inline,
  });

  // Recorded on the redirect rather than on the download itself: the link
  // is time-limited and signed, so issuing one is the access that matters.
  await recordAudit({
    action: "application.file_downloaded",
    actor: current,
    summary: `Opened ${record.fileName}.`,
    targetType: "file",
    targetId: record.id,
    targetLabel: record.fileName,
    applicationId: record.applicationId ?? undefined,
    detail: { inline },
  });

  return NextResponse.redirect(url, 307);
}
