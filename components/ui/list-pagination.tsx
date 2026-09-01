"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export type Paginated<T> = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  items: T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
};

/**
 * Paginates an already-filtered list in the browser.
 *
 * The portal's lists are institute-sized - hundreds of people, not millions -
 * so keeping the whole set client-side keeps search and filtering instant. If
 * a list ever outgrows that, this is the seam to move behind the server.
 */
export function usePagination<T>(items: T[], initialSize = 25): Paginated<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /**
   * Filtering can shrink the list out from under the stored page, so the page
   * is clamped where it is read rather than corrected in an effect - that
   * would render once with a page that does not exist before fixing itself.
   */
  const current = Math.min(page, pageCount);

  const visible = useMemo(() => {
    const start = (current - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, current, pageSize]);

  return {
    page: current,
    pageSize,
    pageCount,
    total,
    items: visible,
    setPage: (next) => setPage(Math.max(1, next)),
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

export type ListPaginationProps = {
  pagination: Paginated<unknown>;
  /** Plural noun for the counter, e.g. "roles". */
  label: string;
};

export function ListPagination({ pagination, label }: ListPaginationProps) {
  const { page, pageCount, pageSize, total, setPage, setPageSize } = pagination;

  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pagination-bar" data-testid="pagination">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing <span className="tabular-nums">{first}</span>–
        <span className="tabular-nums">{last}</span> of{" "}
        <span className="tabular-nums">{total}</span> {label}
      </p>

      <div className="toolbar">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => setPageSize(Number(value))}
        >
          <SelectTrigger className="w-32" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            data-testid="page-previous"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span
            className="px-2 text-sm tabular-nums"
            data-testid="page-indicator"
          >
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
            data-testid="page-next"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
