"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApplicationStatus } from "@/lib/db/schema";

export type ApplicationRow = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  applicantName: string;
  applicantEmail: string;
  department: string;
  stage: string;
  submittedAt: string | null;
  updatedAt: string;
};

const formatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export function ApplicationsTable({
  applications,
}: {
  applications: ApplicationRow[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return applications.filter((app) => {
      if (status !== "all" && app.status !== status) return false;
      if (!needle) return true;
      return [
        app.reference,
        app.applicantName,
        app.applicantEmail,
        app.department,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [applications, query, status]);

  const pagination = usePagination(filtered, 25);

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
            aria-label="Search applications"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as ApplicationStatus | "all")
          }
        >
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
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
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="empty-state border-0">
                      No applications match those filters.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pagination.items.map((app) => (
                  <TableRow key={app.id} data-testid={`row-${app.reference}`}>
                    <TableCell className="font-mono text-sm">
                      {app.reference}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{app.applicantName}</span>
                        <span className="text-xs text-muted-foreground">
                          {app.applicantEmail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {app.department || "-"}
                    </TableCell>
                    <TableCell className="text-sm">{app.stage}</TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {app.submittedAt
                        ? formatter.format(new Date(app.submittedAt))
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/applications/${app.id}`}>View</Link>
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
