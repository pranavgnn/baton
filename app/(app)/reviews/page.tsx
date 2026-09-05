import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { getReviewQueue } from "@/lib/applications/service";
import { requirePermission } from "@/lib/auth/session";
import { nodeById } from "@/lib/workflow/graph";
import { ReviewsTable, type ReviewRow } from "./reviews-table";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewsPage() {
  const current = await requirePermission("applications.review");
  const queue = await getReviewQueue(current);

  const rows: ReviewRow[] = queue.map((app) => ({
    id: app.id,
    reference: app.reference,
    applicantName: app.applicant.name,
    applicantEmail: app.applicant.email,
    department: app.applicant.department ?? "",
    stage: nodeById(app.graph, app.currentNodeId)?.data.label ?? "-",
    submittedAt: app.submittedAt?.toISOString() ?? null,
  }));

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Review queue</h1>
          <p className="page-subtitle">
            Applications waiting on{" "}
            {current.roles.map((r) => r.name).join(", ")}. Whoever acts first
            moves the application forward.
          </p>
        </div>
        <Button asChild variant="outline" data-testid="open-review-history">
          <Link href="/reviews/history">
            <History className="size-4" />
            Your reviews
          </Link>
        </Button>
      </div>

      <ReviewsTable queue={rows} />
    </div>
  );
}
