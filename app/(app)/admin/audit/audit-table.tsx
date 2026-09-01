"use client";

import { Download, Loader2, Search, X } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_GROUPS,
  auditActionLabel,
} from "@/lib/audit/actions";
import type { AuditFilters } from "@/lib/audit/query";
import { formatDateTime } from "@/lib/format";
import { exportAuditLog } from "./actions";

export type AuditRow = {
  id: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  summary: string;
  targetType: string | null;
  targetLabel: string | null;
  applicationId: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export type AuditTableProps = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  pageSizes: number[];
  actors: { id: string; name: string }[];
  filters: AuditFilters;
};

const ANY = "__any__";

export function AuditTable({
  rows,
  total,
  page,
  pageSize,
  pageSizes,
  actors,
  filters,
}: AuditTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = useState(filters.search ?? "");
  const [isExporting, startExport] = useTransition();

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters =
    Boolean(filters.search) ||
    Boolean(filters.actorId) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    (filters.actions?.length ?? 0) > 0;

  /**
   * Filters live in the URL, so a filtered view is a link someone can send to
   * a colleague and comes back intact on reload. Changing any of them returns
   * to the first page: page 4 of the old result set means nothing in the new
   * one.
   */
  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    // typedRoutes cannot know a query string assembled at runtime, and the
    // path itself is the one this component is already rendered on.
    router.push(`${pathname}?${next.toString()}` as Route);
  }

  function handleExport() {
    startExport(async () => {
      const result = await exportAuditLog(filters);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      download(result.data.csv);
      toast.success(
        result.data.truncated
          ? `Exported the most recent ${result.data.rows} entries. Narrow the dates for the rest.`
          : `Exported ${result.data.rows} entries.`,
      );
    });
  }

  return (
    <div className="section-stack">
      <div className="toolbar" data-testid="audit-filters">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ q: search.trim() || null });
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people, records and descriptions"
            aria-label="Search the audit log"
            data-testid="audit-search"
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="size-4" />
            <span className="sr-only">Search</span>
          </Button>
        </form>

        <Select
          value={filters.actions?.[0] ?? ANY}
          onValueChange={(value) =>
            apply({ actions: value === ANY ? null : value })
          }
        >
          <SelectTrigger aria-label="Action" data-testid="audit-action-filter">
            <SelectValue placeholder="Any action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any action</SelectItem>
            {AUDIT_ACTION_GROUPS.map((group) => (
              <SelectGroupItems key={group} group={group} />
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.actorId ?? ANY}
          onValueChange={(value) =>
            apply({ actor: value === ANY ? null : value })
          }
        >
          <SelectTrigger aria-label="Person" data-testid="audit-actor-filter">
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Anyone</SelectItem>
            {actors.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filters.from ?? ""}
          onChange={(event) => apply({ from: event.target.value || null })}
          aria-label="From date"
          data-testid="audit-from"
        />
        <Input
          type="date"
          value={filters.to ?? ""}
          onChange={(event) => apply({ to: event.target.value || null })}
          aria-label="To date"
          data-testid="audit-to"
        />

        {hasFilters ? (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              router.push(pathname as Route);
            }}
            data-testid="audit-clear-filters"
          >
            <X className="size-4" />
            Clear
          </Button>
        ) : null}

        <Button
          variant="outline"
          className="ml-auto"
          onClick={handleExport}
          disabled={isExporting}
          data-testid="audit-export"
        >
          {isExporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table data-testid="audit-table">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>From</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <p className="empty-state" data-testid="audit-empty">
                        {hasFilters
                          ? "Nothing matches these filters."
                          : "Nothing has been recorded yet."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} data-testid={`audit-row-${row.id}`}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {auditActionLabel(row.action)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.actorName ? (
                          <span className="flex flex-col">
                            <span>{row.actorName}</span>
                            <span className="text-xs text-muted-foreground">
                              {row.actorEmail}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </TableCell>
                      <TableCell>{row.summary}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.targetLabel ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {row.ipAddress ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="pagination-bar">
        <p className="text-sm text-muted-foreground" data-testid="audit-count">
          {total} entr{total === 1 ? "y" : "ies"}
        </p>

        <div className="toolbar">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => apply({ size: value })}
          >
            <SelectTrigger aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => apply({ page: String(page - 1) })}
            data-testid="audit-previous"
          >
            Previous
          </Button>
          <span className="text-sm" data-testid="audit-page">
            {page + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => apply({ page: String(page + 1) })}
            data-testid="audit-next"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SelectGroupItems({ group }: { group: string }) {
  return (
    <>
      {AUDIT_ACTIONS.filter((action) => action.group === group).map(
        (action) => (
          <SelectItem key={action.key} value={action.key}>
            {action.label}
          </SelectItem>
        ),
      )}
    </>
  );
}

/**
 * Hands the file to the browser without a round trip to storage: the CSV is
 * already in memory, so a blob URL is all that is needed.
 */
function download(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
