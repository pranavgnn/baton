import { nodeById, nextNodeId } from "./graph";
import {
  DEFAULT_SOURCE_HANDLE,
  type EmailNode,
  type WorkflowGraph,
  type WorkflowNode,
} from "./types";

/** Guards against a malformed graph spinning forever. */
const MAX_AUTOMATED_HOPS = 50;

export type ResolvedTransition =
  | {
      ok: true;
      /** Email nodes traversed on the way, in dispatch order. */
      emails: EmailNode[];
      /**
       * Where the application comes to rest: a stage awaiting human input, the
       * submission node (a send-back), or a terminal end node.
       */
      destination: WorkflowNode;
    }
  | { ok: false; error: string };

/**
 * Follows the graph from `fromNodeId` through `handleId`, firing past every
 * automated Email node until a node that halts the workflow is reached.
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

  let cursorId = nextNodeId(graph, fromNodeId, handleId);
  if (!cursorId) {
    return {
      ok: false,
      error: "This step is not connected to a next step.",
    };
  }

  const emails: EmailNode[] = [];
  for (let hop = 0; hop < MAX_AUTOMATED_HOPS; hop += 1) {
    const node = nodeById(graph, cursorId);
    if (!node) {
      return { ok: false, error: "The next step no longer exists." };
    }

    if (node.kind === "email") {
      emails.push(node);
      const next = nextNodeId(graph, node.id);
      if (!next) {
        return {
          ok: false,
          error: `"${node.data.label}" is not connected to a next step.`,
        };
      }
      cursorId = next;
      continue;
    }

    return { ok: true, emails, destination: node };
  }

  return {
    ok: false,
    error: "The workflow loops through email steps without ever stopping.",
  };
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
