import { formulaError, formulaKeys } from "./calc";
import {
  DEFAULT_SOURCE_HANDLE,
  type AnyField,
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

/** Every node a handle points at, in edge order. */
export function handleTargets(
  graph: WorkflowGraph,
  nodeId: string,
  handleId: string = DEFAULT_SOURCE_HANDLE,
): WorkflowNode[] {
  return graph.edges
    .filter((edge) => edge.source === nodeId && edge.sourceHandle === handleId)
    .map((edge) => nodeById(graph, edge.target))
    .filter((node): node is WorkflowNode => Boolean(node));
}

/**
 * The node that carries the application forward when this handle is taken.
 *
 * A handle may also point at email nodes; those are dispatched in parallel and
 * are not part of the path, so they are skipped here.
 */
export function continuationNodeId(
  graph: WorkflowGraph,
  nodeId: string,
  handleId: string = DEFAULT_SOURCE_HANDLE,
): string | null {
  const target = handleTargets(graph, nodeId, handleId).find(
    (node) => node.kind !== "email",
  );
  return target?.id ?? null;
}

/**
 * The stage this handle leads to when that stage is held for one named person
 * rather than offered to a whole role.
 *
 * Null for every other handle, which is what tells a reviewer's form whether
 * this particular outcome has to be addressed to somebody.
 */
export function nominatedTarget(
  graph: WorkflowGraph,
  nodeId: string,
  handleId: string = DEFAULT_SOURCE_HANDLE,
): StageNode | null {
  const target = handleTargets(graph, nodeId, handleId).find(
    (node) => node.kind !== "email",
  );
  if (!target || target.kind !== "stage") return null;
  return target.data.assignment.mode === "nominated" ? target : null;
}

/** Email nodes fired off when this handle is taken. */
export function emailTargets(
  graph: WorkflowGraph,
  nodeId: string,
  handleId: string = DEFAULT_SOURCE_HANDLE,
): EmailNode[] {
  return handleTargets(graph, nodeId, handleId).filter(
    (node): node is EmailNode => node.kind === "email",
  );
}

/** Handles a node exposes as sources, in render order. */
export function sourceHandles(node: WorkflowNode): string[] {
  switch (node.kind) {
    case "start":
      return [DEFAULT_SOURCE_HANDLE];
    case "stage":
      return node.data.outcomes.map((outcome) => outcome.id);
    // Email nodes are leaves: delivery is asynchronous, so nothing continues
    // from them.
    case "email":
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

/**
 * Checks one source handle. A handle may fan out to several nodes, but exactly
 * one of them may carry the application forward - the rest must be email
 * nodes, which are dispatched in parallel and never continue the workflow.
 */
function checkHandleFanOut(
  graph: WorkflowGraph,
  node: WorkflowNode,
  handleId: string,
  describe: string,
): GraphIssue[] {
  const targets = outgoingEdges(graph, node.id)
    .filter((edge) => edge.sourceHandle === handleId)
    .map((edge) => nodeById(graph, edge.target))
    .filter((target): target is WorkflowNode => Boolean(target));

  if (targets.length === 0) {
    return [
      {
        severity: "error",
        nodeId: node.id,
        message: `${describe} goes nowhere.`,
      },
    ];
  }

  const continuations = targets.filter((target) => target.kind !== "email");

  if (continuations.length === 0) {
    return [
      {
        severity: "error",
        nodeId: node.id,
        message: `${describe} only sends email. It also needs a step that carries the application forward.`,
      },
    ];
  }

  if (continuations.length > 1) {
    const labels = continuations.map((target) => `"${target.data.label}"`);
    return [
      {
        severity: "error",
        nodeId: node.id,
        message: `${describe} leads to ${labels.join(" and ")}. Only email steps may run alongside the one that continues.`,
      },
    ];
  }

  return [];
}

/**
 * Rules on a field that name an answer the scope does not hold.
 *
 * A field's rules may only reference its siblings: the other questions of the
 * same form, or the other columns of the same entry. Anything else silently
 * never matches.
 */
function danglingConditions(
  field: AnyField,
  availableKeys: Set<string>,
): string[] {
  const messages: string[] = [];

  // A formula is subject to the same rule as a condition, and to being
  // readable at all: either failure silently produces no answer.
  if (field.formula) {
    const error = formulaError(field.formula);
    if (error) {
      messages.push(`The formula on "${field.label}" cannot be read: ${error}`);
    } else {
      for (const key of formulaKeys(field.formula)) {
        if (availableKeys.has(key)) continue;
        messages.push(
          `"${field.label}" is worked out from "${key}", which is not a question on the same form.`,
        );
      }
    }
  }

  for (const [what, group] of [
    ["shown", field.visibleWhen],
    ["required", field.requiredWhen],
  ] as const) {
    for (const rule of group?.rules ?? []) {
      if (availableKeys.has(rule.field)) continue;
      messages.push(
        `"${field.label}" is ${what} based on "${rule.field}", which is not a question on the same form.`,
      );
    }
  }

  return messages;
}

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
      message: "The workflow needs an Applicant Submission step.",
    });
  } else if (starts.length > 1) {
    issues.push({
      severity: "error",
      message: `Only one Applicant Submission step is allowed - found ${starts.length}.`,
    });
  }

  if (endNodes(graph).length === 0) {
    issues.push({
      severity: "error",
      message: "The workflow needs at least one End step.",
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
        message: `"${node.data.label}" cannot be reached from the submission form.`,
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
              message: `"${node.data.label}" has two questions using the key "${field.key}".`,
            });
          }
          keys.add(field.key);

          if (field.type !== "repeater") continue;

          // A group's columns are stored inside its own entries, so they share
          // a namespace with each other but not with the form around them.
          const columns = field.fields ?? [];
          if (columns.length === 0) {
            issues.push({
              severity: "error",
              nodeId: node.id,
              message: `"${field.label}" is a repeating group with no columns.`,
            });
          }

          const columnKeys = new Set<string>();
          for (const column of columns) {
            if (column.type === "heading" || column.type === "paragraph") {
              continue;
            }
            if (column.type === "repeater") {
              issues.push({
                severity: "error",
                nodeId: node.id,
                message: `"${column.label}" cannot be a repeating group inside "${field.label}".`,
              });
            }
            if (columnKeys.has(column.key)) {
              issues.push({
                severity: "error",
                nodeId: node.id,
                message: `"${field.label}" has two columns using the key "${column.key}".`,
              });
            }
            columnKeys.add(column.key);
          }
        }
      }
      // A rule pointing at a question that no longer exists never matches,
      // which would quietly hide a field or drop a requirement.
      for (const section of node.data.form.sections) {
        for (const field of section.fields) {
          for (const message of danglingConditions(field, keys)) {
            issues.push({ severity: "error", nodeId: node.id, message });
          }

          if (field.type !== "repeater") continue;
          const columnKeys = new Set(
            (field.fields ?? []).map((column) => column.key),
          );
          for (const column of field.fields ?? []) {
            for (const message of danglingConditions(column, columnKeys)) {
              issues.push({ severity: "error", nodeId: node.id, message });
            }
          }
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
        } else {
          issues.push(
            ...checkHandleFanOut(
              graph,
              node,
              DEFAULT_SOURCE_HANDLE,
              `"${node.data.label}"`,
            ),
          );
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
          issues.push(
            ...checkHandleFanOut(
              graph,
              node,
              outcome.id,
              `Outcome "${outcome.label}" on "${node.data.label}"`,
            ),
          );
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

        if (out.length > 0) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" cannot lead anywhere. Email is sent in the background, so it runs alongside the step that continues rather than in front of it.`,
          });
        }

        if (incomingEdges(graph, node.id).length === 0) {
          issues.push({
            severity: "warning",
            nodeId: node.id,
            message: `"${node.data.label}" is never triggered by anything.`,
          });
        }
        break;
      }

      case "end": {
        if (out.length > 0) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `"${node.data.label}" closes the application, so it cannot lead anywhere.`,
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
        message:
          "The workflow has a connection to a step that no longer exists.",
      });
      break;
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: GraphIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
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
    for (const edge of outgoingEdges(graph, id)) {
      const target = nodeById(graph, edge.target);
      // Email branches are side effects, not steps on the path.
      if (target && target.kind !== "email") queue.push(edge.target);
    }
  }

  return ordered;
}

/**
 * Everything about a graph except the forms and cosmetic labels: the nodes
 * that exist, what kind they are, how they are wired, and who acts on them.
 *
 * Someone with `forms.manage` but not `workflow.manage` may change the
 * questions on a step but not the shape of the process, so their save is
 * compared against the stored graph on this signature.
 */
export function structureSignature(graph: WorkflowGraph): string {
  return JSON.stringify({
    nodes: [...graph.nodes]
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        roleId: node.kind === "stage" ? node.data.roleId : null,
        // Who may act on a stage is structure, not wording: moving it from a
        // whole role to one named person is a change to the process.
        assignment: node.kind === "stage" ? node.data.assignment : null,
        outcomes:
          node.kind === "stage"
            ? node.data.outcomes.map((outcome) => outcome.id)
            : [],
        templateId: node.kind === "email" ? node.data.templateId : null,
        recipientMode: node.kind === "email" ? node.data.recipientMode : null,
        recipientRoleId:
          node.kind === "email" ? node.data.recipientRoleId : null,
        recipientEmail: node.kind === "email" ? node.data.recipientEmail : null,
        result: node.kind === "end" ? node.data.result : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges]
      .map((edge) => [edge.source, edge.sourceHandle, edge.target].join(">"))
      .sort(),
  });
}
