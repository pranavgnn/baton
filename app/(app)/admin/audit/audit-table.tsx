"use client";

import { Check, Download, Filter, Loader2, Search, X } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageNumberInput } from "@/components/ui/list-pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import type { AuditActor, AuditFilters } from "@/lib/audit/query";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportAuditLog, findAuditActors } from "./actions";

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
  /** Only the actor the filter names, if any - never the whole directory. */
  actor: AuditActor | null;
  filters: AuditFilters;
};

export function AuditTable({
  rows,
  total,
  page,
  pageSize,
  pageSizes,
  actor,
  filters,
}: AuditTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = useState(filters.search ?? "");
  const [isExporting, startExport] = useTransition();

  const selectedActions = filters.actions ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const activeCount =
    selectedActions.length +
    (filters.actorId ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.search ? 1 : 0);

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

  function toggleAction(key: string) {
    const next = selectedActions.includes(key)
      ? selectedActions.filter((entry) => entry !== key)
      : [...selectedActions, key];
    apply({ actions: next.join(",") || null });
  }

  function clearAll() {
    setSearch("");
    router.push(pathname as Route);
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
      {/* One line of controls: what to look for, how to narrow it, and out. */}
      <div className="audit-toolbar" data-testid="audit-filters">
        <form
          className="audit-search"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ q: search.trim() || null });
          }}
        >
          <Search className="audit-search-icon" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people, records and descriptions"
            aria-label="Search the audit log"
            className="pl-8"
            data-testid="audit-search"
          />
        </form>

        <ActionFilter
          key={selectedActions.join(",")}
          selected={selectedActions}
          onApply={(actions) => apply({ actions: actions.join(",") || null })}
        />

        <ActorFilter
          actor={actor}
          onSelect={(next) => apply({ actor: next?.id ?? null })}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" data-testid="audit-date-filter">
              <Filter className="size-4" />
              Dates
              {filters.from || filters.to ? (
                <Badge variant="secondary">1</Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audit-from">From</Label>
                <Input
                  id="audit-from"
                  type="date"
                  value={filters.from ?? ""}
                  onChange={(event) =>
                    apply({ from: event.target.value || null })
                  }
                  data-testid="audit-from"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audit-to">To</Label>
                <Input
                  id="audit-to"
                  type="date"
                  value={filters.to ?? ""}
                  onChange={(event) =>
                    apply({ to: event.target.value || null })
                  }
                  data-testid="audit-to"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

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

      {/* What is currently narrowing the list, each one removable on its own. */}
      {activeCount > 0 ? (
        <div className="audit-chips" data-testid="audit-active-filters">
          {filters.search ? (
            <FilterChip
              label={`matching "${filters.search}"`}
              onRemove={() => {
                setSearch("");
                apply({ q: null });
              }}
            />
          ) : null}

          {selectedActions.map((action) => (
            <FilterChip
              key={action}
              label={auditActionLabel(action)}
              onRemove={() => toggleAction(action)}
            />
          ))}

          {filters.actorId ? (
            <FilterChip
              label={`by ${actor?.name ?? "someone"}`}
              onRemove={() => apply({ actor: null })}
            />
          ) : null}

          {filters.from ? (
            <FilterChip
              label={`from ${filters.from}`}
              onRemove={() => apply({ from: null })}
            />
          ) : null}
          {filters.to ? (
            <FilterChip
              label={`to ${filters.to}`}
              onRemove={() => apply({ to: null })}
            />
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            data-testid="audit-clear-filters"
          >
            Clear all
          </Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table data-testid="audit-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead className="w-52">Who</TableHead>
                  <TableHead className="w-44">Action</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead className="w-32">From</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <p className="empty-state" data-testid="audit-empty">
                        {activeCount > 0
                          ? "Nothing matches these filters."
                          : "Nothing has been recorded yet."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} data-testid={`audit-row-${row.id}`}>
                      <TableCell className="align-top whitespace-nowrap tabular-nums">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell className="align-top">
                        {row.actorName ? (
                          <span className="flex flex-col">
                            <span className="font-medium">{row.actorName}</span>
                            <span className="text-xs text-muted-foreground">
                              {row.actorEmail}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline" className="whitespace-nowrap">
                          {auditActionLabel(row.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="flex flex-col">
                          <span>{row.summary}</span>
                          {row.targetLabel ? (
                            <span className="text-xs text-muted-foreground">
                              {row.targetLabel}
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-muted-foreground tabular-nums">
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
          {/* The same control as every client-side list, over a query the
              server answers: typing a page is how anyone reaches page 40 of
              an audit trail. */}
          <PageNumberInput
            page={page + 1}
            pageCount={pages}
            onGo={(wanted) => apply({ page: String(wanted - 1) })}
          />
          <span
            className="text-sm text-muted-foreground tabular-nums"
            data-testid="audit-page"
          >
            / {pages}
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

/* -------------------------------------------------------------------------- */
/*  Filters                                                                    */
/* -------------------------------------------------------------------------- */

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="audit-chip">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/**
 * Any number of actions at once, grouped as the vocabulary groups them.
 *
 * The choices are collected while the panel is open and applied when it
 * closes, so picking four actions is one navigation rather than four - and the
 * list cannot be re-rendered out from under the pointer mid-selection.
 */
function ActionFilter({
  selected,
  onApply,
}: {
  selected: string[];
  onApply: (actions: string[]) => void;
}) {
  const [draft, setDraft] = useState(selected);

  function toggle(key: string) {
    setDraft((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) return;
        const changed =
          draft.length !== selected.length ||
          draft.some((entry) => !selected.includes(entry));
        if (changed) onApply(draft);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" data-testid="audit-action-filter">
          Actions
          {draft.length > 0 ? (
            <Badge variant="secondary">{draft.length}</Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find an action" />
          <CommandList>
            <CommandEmpty>No action by that name.</CommandEmpty>
            {AUDIT_ACTION_GROUPS.map((group) => (
              <CommandGroup key={group} heading={group}>
                {AUDIT_ACTIONS.filter((action) => action.group === group).map(
                  (action) => (
                    <CommandItem
                      key={action.key}
                      value={`${action.label} ${action.key}`}
                      onSelect={() => toggle(action.key)}
                      data-testid={`audit-action-${action.key}`}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          draft.includes(action.key)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {action.label}
                    </CommandItem>
                  ),
                )}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One person, found by typing.
 *
 * The candidates are fetched as the admin types and always bounded, because an
 * institute has thousands of accounts and a list of all of them helps nobody.
 */
function ActorFilter({
  actor,
  onSelect,
}: {
  actor: AuditActor | null;
  onSelect: (actor: AuditActor | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuditActor[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Debounced, and driven by what the admin does rather than by an effect
   * watching state: a keystroke should not be a database query, and there is
   * nothing here to synchronise - only a request to make when they type.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function lookup(next: string, delay = 250) {
    setQuery(next);
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      const result = await findAuditActors(next);
      setResults(result.ok ? result.data.actors : []);
      setLoading(false);
    }, delay);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) lookup(query, 0);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" data-testid="audit-actor-filter">
          {actor ? actor.name : "Anyone"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a name or email"
            value={query}
            onValueChange={lookup}
            data-testid="audit-actor-search"
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching
              </div>
            ) : (
              <CommandEmpty>Nobody in the log matches that.</CommandEmpty>
            )}

            <CommandGroup>
              {actor ? (
                <CommandItem
                  value="__anyone__"
                  onSelect={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                  data-testid="audit-actor-anyone"
                >
                  Anyone
                </CommandItem>
              ) : null}

              {results.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  onSelect={() => {
                    onSelect(entry);
                    setOpen(false);
                  }}
                  data-testid={`audit-actor-${entry.email ?? entry.id}`}
                >
                  <span className="flex flex-col">
                    <span>{entry.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.email}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
