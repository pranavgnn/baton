import { nodeById, outgoingEdges } from "./graph";
import {
  DEFAULT_SOURCE_HANDLE,
  type EmailNode,
  type WorkflowGraph,
  type WorkflowNode,
} from "./types";

export type ResolvedTransition =
  | {
      ok: true;
      /**
       * Email nodes hanging off this handle. They are dispatched in parallel
       * and do not sit between the source and the destination - delivery is
       * asynchronous, so the application never waits on it.
       */
      emails: EmailNode[];
      /**
       * Where the application comes to rest: a stage awaiting human input, the
       * submission node (a send-back), or a terminal end node.
       */
      destination: WorkflowNode;
    }
  | { ok: false; error: string };

/**
 * Resolves what leaving `fromNodeId` through `handleId` does.
 *
 * A handle may fan out to several nodes: exactly one of them continues the
 * workflow, and any others must be email nodes, which are fired off in
 * parallel. Email nodes are leaves - nothing continues from them - so there is
 * no chain to walk and no way for the graph to spin.
 */
export function resolveTransition(
  graph: WorkflowGraph,
  fromNodeId: string,
  handleId: string = DEFAULT_SOURCE_HANDLE,
): ResolvedTransition {
  const source = nodeById(graph, fromNodeId);
  if (!source) {
    return { ok: false, error: "The current step no longer exists." };
  }

  if (source.kind === "stage") {
    const outcome = source.data.outcomes.find((o) => o.id === handleId);
    if (!outcome) {
      return { ok: false, error: "That outcome is not available." };
    }
  }

  const targets = outgoingEdges(graph, fromNodeId)
    .filter((edge) => edge.sourceHandle === handleId)
    .map((edge) => nodeById(graph, edge.target));

  if (targets.length === 0) {
    return { ok: false, error: "This step is not connected to a next step." };
  }
  if (targets.some((node) => !node)) {
    return { ok: false, error: "The next step no longer exists." };
  }

  const found = targets as WorkflowNode[];
  const emails = found.filter(
    (node): node is EmailNode => node.kind === "email",
  );
  const continuations = found.filter((node) => node.kind !== "email");

  if (continuations.length === 0) {
    return {
      ok: false,
      error:
        "This step only sends email and never continues - it needs a step that carries the application forward.",
    };
  }
  if (continuations.length > 1) {
    return {
      ok: false,
      error:
        "This step leads to more than one next step. Only email steps may run alongside the one that continues.",
    };
  }

  return { ok: true, emails, destination: continuations[0] };
}

/**
 * Entry transition taken the moment an applicant submits. Identical to a stage
 * transition but always leaves the start node through its single handle.
 */
export function resolveSubmission(
  graph: WorkflowGraph,
  startNodeId: string,
): ResolvedTransition {
  return resolveTransition(graph, startNodeId, DEFAULT_SOURCE_HANDLE);
}

export type ApplicationOutcome =
  | { kind: "awaiting_stage"; nodeId: string }
  | { kind: "returned_to_applicant"; nodeId: string }
  | {
      kind: "finished";
      nodeId: string;
      result: "approved" | "rejected" | "withdrawn";
    };

export function classifyDestination(node: WorkflowNode): ApplicationOutcome {
  switch (node.kind) {
    case "stage":
      return { kind: "awaiting_stage", nodeId: node.id };
    case "start":
      return { kind: "returned_to_applicant", nodeId: node.id };
    case "end":
      return { kind: "finished", nodeId: node.id, result: node.data.result };
    case "email":
      // resolveTransition never rests on an email node.
      return { kind: "awaiting_stage", nodeId: node.id };
  }
}
