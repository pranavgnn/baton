"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  AlertTriangle,
  CircleCheckBig,
  CircleSlash,
  FileInput,
  Mail,
  UserCheck,
} from "lucide-react";
import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  EmailNodeData,
  EndNodeData,
  StageNodeData,
  StartNodeData,
} from "@/lib/workflow/types";

/**
 * React Flow requires node data to be an index signature, so each custom node
 * carries its domain data under a `payload` key alongside builder-only hints.
 */
export type BuilderNodeData<T> = {
  payload: T;
  /** Resolved display strings the canvas needs but the domain data lacks. */
  roleName?: string | null;
  templateName?: string | null;
  hasError?: boolean;
};

export type StartFlowNode = Node<BuilderNodeData<StartNodeData>, "start">;
export type StageFlowNode = Node<BuilderNodeData<StageNodeData>, "stage">;
export type EmailFlowNode = Node<BuilderNodeData<EmailNodeData>, "email">;
export type EndFlowNode = Node<BuilderNodeData<EndNodeData>, "end">;

export type BuilderNode =
  StartFlowNode | StageFlowNode | EmailFlowNode | EndFlowNode;

function Shell({
  accent,
  selected,
  hasError,
  children,
  testId,
}: {
  accent: "start" | "stage" | "email" | "end";
  selected?: boolean;
  hasError?: boolean;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flow-node",
        `node-accent-${accent}`,
        selected && "flow-node-selected",
        hasError && "border-destructive",
      )}
    >
      {children}
    </div>
  );
}

export const StartNodeView = memo(function StartNodeView({
  data,
  selected,
}: NodeProps<StartFlowNode>) {
  const sectionCount = data.payload.form.sections.length;
  const fieldCount = data.payload.form.sections.reduce(
    (total, section) => total + section.fields.length,
    0,
  );

  return (
    <Shell
      accent="start"
      selected={selected}
      hasError={data.hasError}
      testId="node-start"
    >
      <div className="flow-node-header">
        <FileInput className="size-4" />
        {data.payload.label}
      </div>
      <div className="flow-node-body">
        <span className="flow-node-meta">
          {sectionCount} section{sectionCount === 1 ? "" : "s"} · {fieldCount}{" "}
          field{fieldCount === 1 ? "" : "s"}
        </span>
        <Badge variant="outline" className="self-start">
          Entry point
        </Badge>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="flow-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="flow-handle"
      />
    </Shell>
  );
});

export const StageNodeView = memo(function StageNodeView({
  data,
  selected,
}: NodeProps<StageFlowNode>) {
  const outcomes = data.payload.outcomes;

  return (
    <Shell
      accent="stage"
      selected={selected}
      hasError={data.hasError}
      testId={`node-stage-${data.payload.label}`}
    >
      <div className="flow-node-header">
        <UserCheck className="size-4" />
        {data.payload.label}
      </div>
      <div className="flow-node-body">
        <span className="flow-node-meta">
          {data.roleName ? (
            <>Assigned to {data.roleName}</>
          ) : (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" />
              No role assigned
            </span>
          )}
        </span>

        {outcomes.length === 0 ? (
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="size-3" />
            No outcomes
          </span>
        ) : (
          outcomes.map((outcome) => (
            <div key={outcome.id} className="flow-outcome-row">
              <span className="truncate">{outcome.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={outcome.id}
                className="flow-handle"
              />
            </div>
          ))
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="flow-handle"
      />
    </Shell>
  );
});

export const EmailNodeView = memo(function EmailNodeView({
  data,
  selected,
}: NodeProps<EmailFlowNode>) {
  const recipient =
    data.payload.recipientMode === "applicant"
      ? "the applicant"
      : data.payload.recipientMode === "role"
        ? (data.roleName ?? "an unset role")
        : data.payload.recipientEmail || "an unset address";

  return (
    <Shell
      accent="email"
      selected={selected}
      hasError={data.hasError}
      testId={`node-email-${data.payload.label}`}
    >
      <div className="flow-node-header">
        <Mail className="size-4" />
        {data.payload.label}
      </div>
      <div className="flow-node-body">
        <span className="flow-node-meta">
          {data.templateName ? (
            <>Sends &ldquo;{data.templateName}&rdquo;</>
          ) : (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" />
              No template selected
            </span>
          )}
        </span>
        <span className="flow-node-meta">To {recipient}</span>
        <Badge variant="outline" className="self-start">
          Sent in the background
        </Badge>
      </div>
      {/* No source handle: delivery is asynchronous, so an email node runs
          alongside the step that continues rather than in front of it. */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="flow-handle"
      />
    </Shell>
  );
});

export const EndNodeView = memo(function EndNodeView({
  data,
  selected,
}: NodeProps<EndFlowNode>) {
  const Icon =
    data.payload.result === "approved" ? CircleCheckBig : CircleSlash;

  return (
    <Shell
      accent="end"
      selected={selected}
      hasError={data.hasError}
      testId={`node-end-${data.payload.label}`}
    >
      <div className="flow-node-header">
        <Icon className="size-4" />
        {data.payload.label}
      </div>
      <div className="flow-node-body">
        <span className="flow-node-meta">
          Marks the application as {data.payload.result}
        </span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="flow-handle"
      />
    </Shell>
  );
});

export const NODE_TYPES = {
  start: StartNodeView,
  stage: StageNodeView,
  email: EmailNodeView,
  end: EndNodeView,
};
