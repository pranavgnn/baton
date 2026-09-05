import { continuationNodeId, nodeById, outgoingEdges } from "./graph";
import type { WorkflowGraph, WorkflowNode } from "./types";

/**
 * Turns an application's history into a picture of the route it has taken
 * through its own workflow snapshot.
 *
 * Email steps are left out entirely: they are notifications, not places an
 * application goes, and the person who sent it cares where it is,
 * not what was posted.
 */

export type ProgressNodeState = "done" | "current" | "upcoming";

export type ProgressStep = {
  nodeId: string;
  label: string;
  /** Role responsible, for stages. */
  roleName: string | null;
  state: ProgressNodeState;
  /** How many times the application has passed through, for loops. */
  visits: number;
  /** ISO timestamp of the application's latest arrival here. */
  enteredAt: string | null;
  /** ISO timestamp of its latest departure. Null while it is still here. */
  completedAt: string | null;
};

export type ProgressEdge = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  label: string;
  /** True when the application actually travelled this connection. */
  travelled: boolean;
};

export type ProgressGraph = {
  steps: ProgressStep[];
  edges: ProgressEdge[];
  currentNodeId: string | null;
};

/** One completed hop, oldest first. */
export type TravelledStep = {
  nodeId: string;
  /** Outcome handle taken out of that node, when there was one. */
  handleId: string | null;
  /** ISO timestamp of when the step was completed. */
  at: string;
};

export type BuildProgressInput = {
  graph: WorkflowGraph;
  travelled: TravelledStep[];
  currentNodeId: string | null;
  /** Resolves a stage's role id to a name for display. */
  roleName: (roleId: string | null) => string | null;
  /** ISO timestamp the application was created, which is when it entered the
   * submission step. */
  startedAt: string | null;
};

export function buildProgressGraph({
  graph,
  travelled,
  currentNodeId,
  roleName,
  startedAt,
}: BuildProgressInput): ProgressGraph {
  const visible = graph.nodes.filter((node) => node.kind !== "email");

  const visits = new Map<string, number>();
  for (const step of travelled) {
    visits.set(step.nodeId, (visits.get(step.nodeId) ?? 0) + 1);
  }

  // A node counts as visited if the application has left it, or is sitting on
  // it now.
  const travelledEdges = new Set<string>();

  /**
   * When each step was last arrived at and last left. A step is entered at the
   * moment the one before it was completed, so a single pass over the history
   * fills both - and a loop simply overwrites the earlier visit, which is what
   * someone tracking their application wants to read.
   */
  const enteredAt = new Map<string, string>();
  const completedAt = new Map<string, string>();

  const start = visible.find((node) => node.kind === "start");
  if (start && startedAt) enteredAt.set(start.id, startedAt);

  for (const step of travelled) {
    completedAt.set(step.nodeId, step.at);
    if (!step.handleId) continue;
    const target = continuationNodeId(graph, step.nodeId, step.handleId);
    if (!target) continue;
    travelledEdges.add(`${step.nodeId}>${step.handleId}>${target}`);
    enteredAt.set(target, step.at);
  }

  const steps: ProgressStep[] = visible.map((node) => ({
    nodeId: node.id,
    label: node.data.label,
    roleName: node.kind === "stage" ? roleName(node.data.roleId) : null,
    state:
      node.id === currentNodeId
        ? "current"
        : (visits.get(node.id) ?? 0) > 0
          ? "done"
          : "upcoming",
    visits: visits.get(node.id) ?? 0,
    enteredAt: enteredAt.get(node.id) ?? null,
    // Sitting here now: an earlier visit's departure is not this one's.
    completedAt:
      node.id === currentNodeId ? null : (completedAt.get(node.id) ?? null),
  }));

  const edges: ProgressEdge[] = [];
  for (const node of visible) {
    for (const edge of outgoingEdges(graph, node.id)) {
      const target = nodeById(graph, edge.target);
      // Email branches are not part of the route.
      if (!target || target.kind === "email") continue;

      edges.push({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        label: outcomeLabel(node, edge.sourceHandle),
        travelled: travelledEdges.has(
          `${edge.source}>${edge.sourceHandle}>${edge.target}`,
        ),
      });
    }
  }

  return { steps, edges, currentNodeId };
}

function outcomeLabel(node: WorkflowNode, handleId: string): string {
  if (node.kind !== "stage") return "";
  return (
    node.data.outcomes.find((outcome) => outcome.id === handleId)?.label ?? ""
  );
}
