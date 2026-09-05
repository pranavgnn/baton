"use client";

import { ClipboardList, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ReviewRow = {
  id: string;
  reference: string;
  applicantName: string;
  applicantEmail: string;
  department: string;
  stage: string;
  submittedAt: string | null;
};

const formatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export function ReviewsTable({ queue }: { queue: ReviewRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return queue;
    return queue.filter((row) =>
      [row.reference, row.applicantName, row.applicantEmail, row.department]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [queue, query]);

  const pagination = usePagination(filtered, 25);

  if (queue.length === 0) {
    return (
      <div className="empty-state">
        <ClipboardList className="size-6" />
        Nothing is waiting on you right now.
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
            placeholder="Search by reference, applicant or department"
            className="pl-8"
            aria-label="Search the queue"
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
                <TableHead>Department</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="empty-state border-0">
                      Nothing matches that search.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pagination.items.map((row) => (
                  <TableRow key={row.id} data-testid={`queue-${row.reference}`}>
                    <TableCell className="font-mono text-sm">
                      {row.reference}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.applicantName}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.applicantEmail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.department || "-"}
                    </TableCell>
                    <TableCell className="text-sm">{row.stage}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.submittedAt
                        ? formatter.format(new Date(row.submittedAt))
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm">
                        <Link href={`/reviews/${row.id}`}>Review</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ListPagination pagination={pagination} label="applications" />
    </>
  );
}
