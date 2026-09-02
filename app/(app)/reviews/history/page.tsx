import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { listReviewsBy } from "@/lib/applications/service";
import { requirePermission } from "@/lib/auth/session";
import { ReviewedTable, type ReviewedRow } from "./reviewed-table";

export const metadata: Metadata = { title: "Your reviews" };

/**
 * Everything this reviewer has signed off.
 *
 * A queue empties as it is worked through, which leaves a reviewer with no way
 * back to a decision they took last month - to remind themselves what they
 * said, or to see what became of it.
 */
export default async function ReviewHistoryPage() {
  const current = await requirePermission("applications.review");
  const reviews = await listReviewsBy(current.id);

  const rows: ReviewedRow[] = reviews.map((review) => ({
    eventId: review.eventId,
    applicationId: review.applicationId,
    reference: review.reference,
    applicantName: review.applicantName,
    applicantEmail: review.applicantEmail,
    school: review.school ?? "",
    status: review.status,
    stageLabel: review.stageLabel ?? "",
    outcomeLabel: review.outcomeLabel ?? "",
    reviewedAt: review.reviewedAt.toISOString(),
  }));

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Your reviews</h1>
          <p className="page-subtitle">
            Every decision you have recorded, most recent first, and where each
            application stands now.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reviews">
            <ArrowLeft className="size-4" />
            Back to the queue
          </Link>
        </Button>
      </div>

      <ReviewedTable rows={rows} />
    </div>
  );
}
