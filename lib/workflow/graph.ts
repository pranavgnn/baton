import {
  DEFAULT_SOURCE_HANDLE,
  type EmailNode,
  type EndNode,
  type StageNode,
  type StartNode,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Lookups                                                                    */
/* -------------------------------------------------------------------------- */

export function nodeById(
  graph: WorkflowGraph,
  id: string | null | undefined,
): WorkflowNode | undefined {
  if (!id) return undefined;
  return graph.nodes.find((node) => node.id === id);
}

export function startNode(graph: WorkflowGraph): StartNode | undefined {
  return graph.nodes.find((node): node is StartNode => node.kind === "start");
}

export function stageNodes(graph: WorkflowGraph): StageNode[] {
  return graph.nodes.filter((node): node is StageNode => node.kind === "stage");
}

export function emailNodes(graph: WorkflowGraph): EmailNode[] {
  return graph.nodes.filter((node): node is EmailNode => node.kind === "email");
}

export function endNodes(graph: WorkflowGraph): EndNode[] {
  return graph.nodes.filter((node): node is EndNode => node.kind === "end");
}

export function outgoingEdges(
  graph: WorkflowGraph,
  nodeId: string,
): WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId);
}

export function incomingEdges(
  graph: WorkflowGraph,
  nodeId: string,
): WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.target === nodeId);
}

/** Resolves the node reached by leaving `nodeId` through `handleId`. */
export function nextNodeId(
  graph: WorkflowGraph,
  nodeId: string,
  handleId: string = DEFAULT_SOURCE_HANDLE,
): string | null {
  const edge = graph.edges.find(
    (e) => e.source === nodeId && e.sourceHandle === handleId,
  );
  return edge?.target ?? null;
}

/** Handles a node exposes as sources, in render order. */
export function sourceHandles(node: WorkflowNode): string[] {
  switch (node.kind) {
    case "start":
    case "email":
      return [DEFAULT_SOURCE_HANDLE];
    case "stage":
      return node.data.outcomes.map((outcome) => outcome.id);
    case "end":
      return [];
  }
}

export function reachableNodeIds(graph: WorkflowGraph): Set<string> {
  const start = startNode(graph);
  const seen = new Set<string>();
  if (!start) return seen;

  const queue = [start.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of outgoingEdges(graph, id)) {
      if (!seen.has(edge.target)) queue.push(edge.target);
    }
  }
  return seen;
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type GraphIssue = {
  severity: "error" | "warning";
  nodeId?: string;
  message: string;
};

export type ValidationContext = {
  roleIds: readonly string[];
  templateIds: readonly string[];
};

/**
 * Publishing is blocked while any `error` issue remains. Warnings are advisory
 * and shown in the canvas inspector.
 */
export function validateGraph(
  graph: WorkflowGraph,
  context: ValidationContext = { roleIds: [], templateIds: [] },
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const starts = graph.nodes.filter((node) => node.kind === "start");

  if (starts.length === 0) {
    issues.push({
      severity: "error",
      message: "The workflow needs an Applicant Submission node.",
    });
  } else if (starts.length > 1) {
    issues.push({
      severity: "error",
      message: `Only one Applicant Submission node is allowed - found ${starts.length}.`,
    });
  }

  if (endNodes(graph).length === 0) {
    issues.push({
      severity: "error",
      message: "The workflow needs at least one End node.",
    });
  }

  const reachable = reachableNodeIds(graph);
  const seenKeysByNode = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    const out = outgoingEdges(graph, node.id);

    if (node.kind !== "start" && !reachable.has(node.id)) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: `"${node.data.label}" cannot be reached from the submission node.`,
      });
    }

    // Duplicate field keys inside one node's form corrupt the data namespace.
    if (node.kind === "start" || node.kind === "stage") {
      const keys = new Set<string>();
      for (const section of node.data.form.sections) {
        for (const field of section.fields) {
          if (field.type === "heading" || field.type === "paragraph") continue;
          if (keys.has(field.key)) {
            issues.push({
              severity: "error",
              nodeId: node.id,
              message: `"${node.data.label}" has two fields using the key "${field.key}".`,
            });
          }
          keys.add(field.key);
        }
      }
      seenKeysByNode.set(node.id, keys);
    }

    switch (node.kind) {
      case "start": {
        if (node.data.form.sections.length === 0) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" needs at least one form section.`,
          });
        }
        if (out.length === 0) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" is not connected to anything.`,
          });
        }
        break;
      }

      case "stage": {
        if (!node.data.roleId) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" has no role assigned.`,
          });
        } else if (
          context.roleIds.length > 0 &&
          !context.roleIds.includes(node.data.roleId)
        ) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" is assigned to a role that no longer exists.`,
          });
        }

        if (node.data.outcomes.length === 0) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" needs at least one outcome.`,
          });
        }

        for (const outcome of node.data.outcomes) {
          const connected = out.filter((e) => e.sourceHandle === outcome.id);
          if (connected.length === 0) {
            issues.push({
              severity: "error",
              nodeId: node.id,
              message: `Outcome "${outcome.label}" on "${node.data.label}" goes nowhere.`,
            });
          } else if (connected.length > 1) {
            issues.push({
              severity: "error",
              nodeId: node.id,
              message: `Outcome "${outcome.label}" on "${node.data.label}" has ${connected.length} connections - it may only have one.`,
            });
          }
        }
        break;
      }

      case "email": {
        if (!node.data.templateId) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" has no email template selected.`,
          });
        } else if (
          context.templateIds.length > 0 &&
          !context.templateIds.includes(node.data.templateId)
        ) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" points at a template that no longer exists.`,
          });
        }

        if (node.data.recipientMode === "role" && !node.data.recipientRoleId) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" sends to a role but no role is selected.`,
          });
        }
        if (
          node.data.recipientMode === "custom" &&
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(node.data.recipientEmail.trim())
        ) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" needs a valid recipient email address.`,
          });
        }

        if (out.length === 0) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" has no next step - email nodes must continue somewhere.`,
          });
        } else if (out.length > 1) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" has more than one next step.`,
          });
        }
        break;
      }

      case "end": {
        if (out.length > 0) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" is an End node and cannot lead anywhere.`,
          });
        }
        break;
      }
    }
  }

  // Edges pointing at deleted nodes.
  for (const edge of graph.edges) {
    if (!nodeById(graph, edge.source) || !nodeById(graph, edge.target)) {
      issues.push({
        severity: "error",
        message: "The workflow contains a connection to a deleted node.",
      });
      break;
    }
  }

  // A run of email nodes that loops forever would hang the transition.
  const emailLoop = findEmailOnlyCycle(graph);
  if (emailLoop) {
    issues.push({
      severity: "error",
      nodeId: emailLoop,
      message:
        "Email nodes form a loop with no stage in between - the workflow would never stop.",
    });
  }

  return issues;
}

export function hasBlockingIssues(issues: GraphIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/** Returns the id of a node participating in an email-only cycle, if any. */
function findEmailOnlyCycle(graph: WorkflowGraph): string | null {
  for (const node of emailNodes(graph)) {
    const seen = new Set<string>([node.id]);
    let cursor = nextNodeId(graph, node.id);
    while (cursor) {
      const next = nodeById(graph, cursor);
      if (!next || next.kind !== "email") break;
      if (seen.has(next.id)) return node.id;
      seen.add(next.id);
      cursor = nextNodeId(graph, next.id);
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Progress helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort ordering used for progress display. The graph can loop, so this
 * is a breadth-first ordering from the start node, not a strict sequence.
 */
export function orderedStageNodes(graph: WorkflowGraph): WorkflowNode[] {
  const start = startNode(graph);
  if (!start) return [];

  const ordered: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue: string[] = [start.id];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodeById(graph, id);
    if (!node) continue;
    if (node.kind === "start" || node.kind === "stage" || node.kind === "end") {
      ordered.push(node);
    }
    for (const edge of outgoingEdges(graph, id)) queue.push(edge.target);
  }

  return ordered;
}
