import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getReviewQueue } from "@/lib/applications/service";
import { requirePermission } from "@/lib/auth/session";
import { nodeById } from "@/lib/workflow/graph";

export const metadata: Metadata = { title: "Review queue" };

const formatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export default async function ReviewsPage() {
  const current = await requirePermission("applications.review");
  const queue = await getReviewQueue(current);

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
      </div>

      {queue.length === 0 ? (
        <div className="empty-state">
          <ClipboardList className="size-6" />
          Nothing is waiting on you right now.
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((app) => {
                    const stage = nodeById(app.graph, app.currentNodeId);
                    return (
                      <TableRow
                        key={app.id}
                        data-testid={`queue-${app.reference}`}
                      >
                        <TableCell className="font-mono text-sm">
                          {app.reference}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {app.applicant.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {app.applicant.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {app.applicant.department ?? "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {stage?.data.label ?? "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {app.submittedAt
                            ? formatter.format(app.submittedAt)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm">
                            <Link href={`/reviews/${app.id}`}>Review</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
