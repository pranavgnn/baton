import { NextResponse } from "next/server";

import {
  canViewApplication,
  getApplicationById,
  getApplicationFiles,
  getTimeline,
} from "@/lib/applications/service";
import { humanStatus } from "@/lib/applications/transition";
import { recordAudit } from "@/lib/audit/record";
import { getCurrentUser } from "@/lib/auth/session";
import { buildPdfModel } from "@/lib/pdf/model";
import { renderApplicationPdf } from "@/lib/pdf/render";

/**
 * The application as a document, at whatever point it has reached.
 *
 * Everything completed so far is included - the submission and every review
 * that has been signed off - so the same route serves a reviewer who wants the
 * file in front of them and Institute HR filing a finished one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const current = await getCurrentUser();
  if (!current || current.disabled) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const { applicationId } = await params;
  const app = await getApplicationById(applicationId);
  if (!app) {
    return NextResponse.json(
      { error: "That application no longer exists." },
      { status: 404 },
    );
  }

  // Exactly the visibility rule the application page uses: an export must not
  // be a way around it.
  if (!canViewApplication(app, current)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const [events, files] = await Promise.all([
    getTimeline(app.id),
    getApplicationFiles(app.id),
  ]);

  const formatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  });

  // Who signed each part, taken from the event that completed it rather than
  // from who holds the role now: the record is of what happened.
  const signatures: Record<string, { name: string; at: string }> = {};
  for (const event of events) {
    if (event.type !== "submitted" && event.type !== "stage_completed") {
      continue;
    }
    if (!event.nodeId) continue;
    signatures[event.nodeId] = {
      name: event.actorName ?? "-",
      at: formatter.format(event.createdAt),
    };
  }

  const model = buildPdfModel({
    graph: app.graph,
    data: app.data,
    reference: app.reference,
    status: humanStatus(app.status),
    applicant: {
      name: app.applicant.name,
      email: app.applicant.email,
      designation: app.applicant.designation,
    },
    signatures,
    generatedAt: formatter.format(new Date()),
  });

  const bytes = await renderApplicationPdf(
    model,
    new Map(files.map((file) => [file.id, { objectKey: file.objectKey }])),
  );

  await recordAudit({
    action: "application.exported",
    actor: current,
    summary: `Exported ${app.reference} as a PDF.`,
    targetType: "application",
    targetId: app.id,
    targetLabel: app.reference,
    applicationId: app.id,
    detail: { parts: model.parts.length, enclosures: model.attachments.length },
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${app.reference}.pdf"`,
      // Reviews are still being added to it, so a cached copy would go stale.
      "Cache-Control": "no-store",
    },
  });
}
