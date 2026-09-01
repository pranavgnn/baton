"use client";

import { History, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { WorkflowGraph } from "@/lib/workflow/types";
import {
  listWorkflowVersions,
  restoreWorkflowVersion,
  type WorkflowRevision,
} from "./actions";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export type VersionHistoryProps = {
  /** Bumped by the builder after a publish so the list refetches. */
  refreshToken: number;
  onRestore: (graph: WorkflowGraph, version: number) => void;
};

export function VersionHistory({
  refreshToken,
  onRestore,
}: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<WorkflowRevision[] | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await listWorkflowVersions();
      if (result.ok) setVersions(result.data.versions);
      else toast.error(result.error);
    });
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, refreshToken, load]);

  function handleRestore(version: number) {
    setRestoring(version);
    startTransition(async () => {
      const result = await restoreWorkflowVersion(version);
      setRestoring(null);
      if (result.ok) {
        onRestore(result.data.graph, version);
        setOpen(false);
        toast.success(
          `Version ${version} loaded onto the canvas. Publish to make it live.`,
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" data-testid="open-version-history">
          <History className="size-4" />
          History
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full gap-0 sm:max-w-md"
        data-testid="version-history"
      >
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>
            Every published revision. Restoring one loads it onto the canvas as
            the draft - it only goes live when you publish again.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <ol className="flex flex-col gap-3 px-4 pb-4">
            {versions === null ? (
              <li className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading revisions
              </li>
            ) : versions.length === 0 ? (
              <li className="empty-state">Nothing has been published yet.</li>
            ) : (
              versions.map((revision) => (
                <li
                  key={revision.version}
                  className="flex flex-col gap-2 rounded-md border bg-card p-3"
                  data-testid={`version-${revision.version}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      Version {revision.version}
                    </span>
                    {revision.isLive ? <Badge>Live</Badge> : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {revision.nodeCount} nodes
                    </span>
                  </div>

                  <p className="text-sm break-words whitespace-pre-wrap">
                    {revision.memo || (
                      <span className="text-muted-foreground italic">
                        No memo left for this version.
                      </span>
                    )}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {formatter.format(new Date(revision.createdAt))} ·{" "}
                    {revision.publishedBy}
                  </p>

                  {revision.isLive ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      disabled={isPending}
                      onClick={() => handleRestore(revision.version)}
                      data-testid={`restore-${revision.version}`}
                    >
                      {restoring === revision.version ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      Restore to canvas
                    </Button>
                  )}
                </li>
              ))
            )}
          </ol>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
