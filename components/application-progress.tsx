"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  CircleCheckBig,
  CircleDot,
  CircleSlash,
  FileInput,
} from "lucide-react";
import { memo, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import type { ProgressGraph, ProgressStep } from "@/lib/workflow/progress";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Node                                                                       */
/* -------------------------------------------------------------------------- */

type ProgressNodeData = {
  step: ProgressStep;
  kind: "start" | "stage" | "end";
  result: "approved" | "rejected" | "withdrawn" | null;
};

type ProgressFlowNode = Node<ProgressNodeData, "progress">;

const ProgressNodeView = memo(function ProgressNodeView({
  data,
}: NodeProps<ProgressFlowNode>) {
  const { step, kind, result } = data;

  const Icon =
    kind === "start"
      ? FileInput
      : kind === "end"
        ? result === "approved"
          ? CircleCheckBig
          : CircleSlash
        : CircleDot;

  return (
    <div
      className={cn("progress-node", `progress-node-${step.state}`)}
      data-testid={`progress-${step.label}`}
      aria-current={step.state === "current" ? "step" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="progress-handle"
        isConnectable={false}
      />

      <div className="progress-node-header">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{step.label}</span>
      </div>

      <div className="progress-node-body">
        {step.roleName ? (
          <span className="text-xs text-muted-foreground">{step.roleName}</span>
        ) : null}

        <span className="flex flex-wrap items-center gap-1">
          {step.state === "current" ? (
            <Badge data-testid="progress-current">Here now</Badge>
          ) : step.state === "done" ? (
            <Badge variant="secondary">Passed</Badge>
          ) : (
            <Badge variant="outline">Not yet</Badge>
          )}
          {step.visits > 1 ? (
            <Badge variant="outline" title="Revisited by a send-back">
              ×{step.visits}
            </Badge>
          ) : null}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="progress-handle"
        isConnectable={false}
      />
    </div>
  );
});

const NODE_TYPES = { progress: ProgressNodeView };

/* -------------------------------------------------------------------------- */
/*  Canvas                                                                     */
/* -------------------------------------------------------------------------- */

export type ApplicationProgressProps = {
  progress: ProgressGraph;
  /** Positions from the workflow snapshot, so it reads like the admin's map. */
  positions: Record<string, { x: number; y: number }>;
  kinds: Record<string, "start" | "stage" | "end">;
  results: Record<string, "approved" | "rejected" | "withdrawn" | null>;
};

export function ApplicationProgress(props: ApplicationProgressProps) {
  return (
    <ReactFlowProvider>
      <ProgressCanvas {...props} />
    </ReactFlowProvider>
  );
}

function ProgressCanvas({
  progress,
  positions,
  kinds,
  results,
}: ApplicationProgressProps) {
  const nodes = useMemo<ProgressFlowNode[]>(
    () =>
      progress.steps.map((step) => ({
        id: step.nodeId,
        type: "progress" as const,
        position: positions[step.nodeId] ?? { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        connectable: false,
        data: {
          step,
          kind: kinds[step.nodeId] ?? "stage",
          result: results[step.nodeId] ?? null,
        },
      })),
    [progress.steps, positions, kinds, results],
  );

  const edges = useMemo<Edge[]>(
    () =>
      progress.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: "out",
        target: edge.target,
        targetHandle: "in",
        type: "smoothstep",
        label: edge.label || undefined,
        labelShowBg: true,
        animated: edge.travelled,
        // Loops read as loops because this is the real graph, not a stepper.
        className: edge.travelled ? "progress-edge-travelled" : undefined,
      })),
    [progress.edges],
  );

  return (
    <div className="progress-canvas" data-testid="application-progress">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
