import { describe, expect, it } from "vitest";

import {
  hasBlockingIssues,
  incomingEdges,
  nextNodeId,
  orderedStageNodes,
  outgoingEdges,
  reachableNodeIds,
  sourceHandles,
  stageNodes,
  startNode,
  validateGraph,
} from "@/lib/workflow/graph";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { buildGraph, ROLE_HOD, TEMPLATE_ACK } from "./fixtures";

function errorsOf(
  graph: WorkflowGraph,
  context = { roleIds: [ROLE_HOD], templateIds: [TEMPLATE_ACK] },
) {
  return validateGraph(graph, context)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}

describe("graph lookups", () => {
  it("finds the single start node", () => {
    const { graph } = buildGraph();
    expect(startNode(graph)?.id).toBe("start");
  });

  it("resolves the target of a specific outcome handle", () => {
    const { graph, outcomes } = buildGraph();
    expect(nextNodeId(graph, "stage_hod", outcomes.approve.id)).toBe(
      "email_approved",
    );
    expect(nextNodeId(graph, "stage_hod", outcomes.reject.id)).toBe(
      "end_rejected",
    );
    expect(nextNodeId(graph, "stage_hod", "no-such-handle")).toBeNull();
  });

  it("exposes one source handle per stage outcome", () => {
    const { graph, outcomes } = buildGraph();
    const stage = stageNodes(graph)[0];
    expect(sourceHandles(stage)).toEqual([
      outcomes.approve.id,
      outcomes.reject.id,
      outcomes.sendBack.id,
    ]);
  });

  it("treats end nodes as having no way out", () => {
    const { graph } = buildGraph();
    const end = graph.nodes.find((node) => node.id === "end_approved")!;
    expect(sourceHandles(end)).toEqual([]);
    expect(outgoingEdges(graph, "end_approved")).toEqual([]);
  });

  it("walks loops without hanging when computing reachability", () => {
    const { graph } = buildGraph();
    const reachable = reachableNodeIds(graph);
    expect(reachable.has("end_approved")).toBe(true);
    expect(reachable.has("end_rejected")).toBe(true);
    // email_back loops back to start, which must not re-enter the queue.
    expect(reachable.size).toBe(graph.nodes.length);
  });
});

describe("validateGraph", () => {
  it("accepts the reference workflow", () => {
    const { graph, context } = buildGraph();
    const issues = validateGraph(graph, context);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("requires a submission node", () => {
    const { graph, context } = buildGraph();
    graph.nodes = graph.nodes.filter((node) => node.kind !== "start");
    expect(validateGraph(graph, context).map((i) => i.message)).toContain(
      "The workflow needs an Applicant Submission node.",
    );
  });

  it("rejects a second submission node", () => {
    const { graph, context } = buildGraph();
    graph.nodes.push({ ...graph.nodes[0], id: "start2" });
    expect(errorsOf(graph, context)).toContain(
      "Only one Applicant Submission node is allowed - found 2.",
    );
  });

  it("requires at least one end node", () => {
    const { graph, context } = buildGraph();
    graph.nodes = graph.nodes.filter((node) => node.kind !== "end");
    graph.edges = graph.edges.filter((edge) => !edge.target.startsWith("end_"));
    expect(errorsOf(graph, context)).toContain(
      "The workflow needs at least one End node.",
    );
  });

  it("flags a stage with no role", () => {
    const { graph, context } = buildGraph();
    const stage = stageNodes(graph)[0];
    stage.data.roleId = null;
    expect(errorsOf(graph, context)).toContain(
      '"HOD Review" has no role assigned.',
    );
  });

  it("flags a stage bound to a deleted role", () => {
    const { graph } = buildGraph();
    expect(
      errorsOf(graph, { roleIds: ["other"], templateIds: [TEMPLATE_ACK] }),
    ).toContain('"HOD Review" is assigned to a role that no longer exists.');
  });

  it("flags an unconnected outcome", () => {
    const { graph, context, outcomes } = buildGraph();
    graph.edges = graph.edges.filter(
      (edge) => edge.sourceHandle !== outcomes.reject.id,
    );
    expect(errorsOf(graph, context)).toContain(
      'Outcome "Reject" on "HOD Review" goes nowhere.',
    );
  });

  it("flags an outcome wired to two targets", () => {
    const { graph, context, outcomes } = buildGraph();
    graph.edges.push({
      id: "dup",
      source: "stage_hod",
      sourceHandle: outcomes.reject.id,
      target: "end_approved",
    });
    expect(errorsOf(graph, context)).toContain(
      'Outcome "Reject" on "HOD Review" has 2 connections - it may only have one.',
    );
  });

  it("flags a stage with no outcomes", () => {
    const { graph, context } = buildGraph();
    stageNodes(graph)[0].data.outcomes = [];
    expect(errorsOf(graph, context)).toContain(
      '"HOD Review" needs at least one outcome.',
    );
  });

  it("flags an email node without a template", () => {
    const { graph, context } = buildGraph();
    const email = graph.nodes.find((node) => node.id === "email_ack")!;
    if (email.kind === "email") email.data.templateId = null;
    expect(errorsOf(graph, context)).toContain(
      '"Acknowledge" has no email template selected.',
    );
  });

  it("flags an email node pointing at a deleted template", () => {
    const { graph } = buildGraph();
    expect(
      errorsOf(graph, { roleIds: [ROLE_HOD], templateIds: ["gone"] }),
    ).toContain('"Acknowledge" points at a template that no longer exists.');
  });

  it("flags a role-addressed email with no role", () => {
    const { graph, context } = buildGraph();
    const email = graph.nodes.find((node) => node.id === "email_approved")!;
    if (email.kind === "email") email.data.recipientRoleId = null;
    expect(errorsOf(graph, context)).toContain(
      '"Approval Letter" sends to a role but no role is selected.',
    );
  });

  it("flags a custom-recipient email with an invalid address", () => {
    const { graph, context } = buildGraph();
    const email = graph.nodes.find((node) => node.id === "email_ack")!;
    if (email.kind === "email") {
      email.data.recipientMode = "custom";
      email.data.recipientEmail = "not-an-email";
    }
    expect(errorsOf(graph, context)).toContain(
      '"Acknowledge" needs a valid recipient email address.',
    );
  });

  it("flags a dangling email node", () => {
    const { graph, context } = buildGraph();
    graph.edges = graph.edges.filter((edge) => edge.id !== "e2");
    expect(errorsOf(graph, context)).toContain(
      '"Acknowledge" has no next step - email nodes must continue somewhere.',
    );
  });

  it("flags an end node that leads somewhere", () => {
    const { graph, context } = buildGraph();
    graph.edges.push({
      id: "bad",
      source: "end_approved",
      sourceHandle: "out",
      target: "start",
    });
    expect(errorsOf(graph, context)).toContain(
      '"Approved" is an End node and cannot lead anywhere.',
    );
  });

  it("flags duplicate field keys inside one form", () => {
    const { graph, context } = buildGraph();
    const start = startNode(graph)!;
    const section = start.data.form.sections[0];
    section.fields.push({ ...section.fields[0], id: "dup" });
    expect(errorsOf(graph, context)).toContain(
      '"Applicant Submission" has two fields using the key "full_name".',
    );
  });

  it("flags an email-only cycle that would never halt", () => {
    const { graph, context } = buildGraph();
    // Point the acknowledgement back at itself through a second email node.
    graph.nodes.push({
      id: "email_loop",
      kind: "email",
      position: { x: 0, y: 0 },
      data: {
        label: "Loop",
        description: "",
        templateId: TEMPLATE_ACK,
        recipientMode: "applicant",
        recipientRoleId: null,
        recipientEmail: "",
      },
    });
    graph.edges = graph.edges.filter((edge) => edge.id !== "e2");
    graph.edges.push(
      {
        id: "l1",
        source: "email_ack",
        sourceHandle: "out",
        target: "email_loop",
      },
      {
        id: "l2",
        source: "email_loop",
        sourceHandle: "out",
        target: "email_ack",
      },
    );
    expect(errorsOf(graph, context)).toContain(
      "Email nodes form a loop with no stage in between - the workflow would never stop.",
    );
  });

  it("warns about unreachable nodes without blocking publication", () => {
    const { graph, context } = buildGraph();
    graph.nodes.push({
      id: "orphan",
      kind: "end",
      position: { x: 0, y: 0 },
      data: { label: "Orphan", description: "", result: "withdrawn" },
    });
    const issues = validateGraph(graph, context);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        message: '"Orphan" cannot be reached from the submission node.',
      }),
    );
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("requires the submission node to have a form", () => {
    const { graph, context } = buildGraph();
    startNode(graph)!.data.form.sections = [];
    expect(errorsOf(graph, context)).toContain(
      '"Applicant Submission" needs at least one form section.',
    );
  });
});

describe("orderedStageNodes", () => {
  it("starts at the submission node and reaches both endings", () => {
    const { graph } = buildGraph();
    const ordered = orderedStageNodes(graph).map((node) => node.id);

    expect(ordered[0]).toBe("start");
    expect(ordered).toContain("stage_hod");
    expect(ordered).toContain("end_approved");
    expect(ordered).toContain("end_rejected");
    // Email nodes are plumbing, not steps a person sees.
    expect(ordered).not.toContain("email_ack");
  });

  it("returns nothing when the graph has no entry point", () => {
    const { graph } = buildGraph();
    graph.nodes = graph.nodes.filter((node) => node.kind !== "start");
    expect(orderedStageNodes(graph)).toEqual([]);
  });
});

describe("incomingEdges", () => {
  it("finds every route into a shared node", () => {
    const { graph } = buildGraph();
    // Both the reject outcome and nothing else lands on the rejected ending.
    expect(incomingEdges(graph, "end_rejected").map((e) => e.id)).toEqual([
      "e4",
    ]);
    // The submission node is re-entered by the send-back loop.
    expect(incomingEdges(graph, "start").map((e) => e.id)).toEqual(["e6"]);
  });
});
