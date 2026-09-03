"use client";

import { History, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApplicationStatus } from "@/lib/db/schema";

export type ReviewedRow = {
  eventId: string;
  applicationId: string;
  reference: string;
  applicantName: string;
  applicantEmail: string;
  school: string;
  status: ApplicationStatus;
  stageLabel: string;
  outcomeLabel: string;
  reviewedAt: string;
};

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ReviewedTable({ rows }: { rows: ReviewedRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.reference,
        row.applicantName,
        row.applicantEmail,
        row.school,
        row.stageLabel,
        row.outcomeLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, query]);

  const pagination = usePagination(filtered, 25);

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <History className="size-6" />
        You have not signed off on anything yet.
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by reference, applicant, step or outcome"
            className="pl-8"
            aria-label="Search your reviews"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Your step</TableHead>
                <TableHead>What you recorded</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Now</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="empty-state border-0">
                      Nothing matches that search.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pagination.items.map((row) => (
                  <TableRow
                    key={row.eventId}
                    data-testid={`reviewed-${row.reference}-${row.stageLabel}`}
                  >
                    <TableCell className="font-mono text-sm">
                      {row.reference}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.applicantName}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.school || row.applicantEmail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.stageLabel || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.outcomeLabel || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatter.format(new Date(row.reviewedAt))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/reviews/${row.applicationId}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ListPagination pagination={pagination} label="reviews" />
    </>
  );
}
