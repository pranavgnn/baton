import { describe, expect, it } from "vitest";

import {
  continuationNodeId,
  emailTargets,
  handleTargets,
  hasBlockingIssues,
  incomingEdges,
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

  it("resolves the step that continues, skipping the email branches", () => {
    const { graph, outcomes } = buildGraph();
    expect(continuationNodeId(graph, "stage_hod", outcomes.approve.id)).toBe(
      "end_approved",
    );
    expect(continuationNodeId(graph, "stage_hod", outcomes.reject.id)).toBe(
      "end_rejected",
    );
    expect(continuationNodeId(graph, "stage_hod", "no-such-handle")).toBeNull();
  });

  it("lists the email branches of a handle separately", () => {
    const { graph, outcomes } = buildGraph();
    expect(
      emailTargets(graph, "stage_hod", outcomes.approve.id).map((n) => n.id),
    ).toEqual(["email_approved"]);
    // The reject outcome deliberately has no email attached.
    expect(emailTargets(graph, "stage_hod", outcomes.reject.id)).toEqual([]);
  });

  it("reports every target of a handle, email or not", () => {
    const { graph } = buildGraph();
    expect(handleTargets(graph, "start", "out").map((n) => n.id)).toEqual([
      "stage_hod",
      "email_ack",
    ]);
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

  it("treats email nodes as leaves", () => {
    const { graph } = buildGraph();
    const email = graph.nodes.find((node) => node.id === "email_ack")!;
    expect(sourceHandles(email)).toEqual([]);
    expect(outgoingEdges(graph, "email_ack")).toEqual([]);
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
      "The workflow needs an Applicant Submission step.",
    );
  });

  it("rejects a second submission node", () => {
    const { graph, context } = buildGraph();
    graph.nodes.push({ ...graph.nodes[0], id: "start2" });
    expect(errorsOf(graph, context)).toContain(
      "Only one Applicant Submission step is allowed - found 2.",
    );
  });

  it("requires at least one end node", () => {
    const { graph, context } = buildGraph();
    graph.nodes = graph.nodes.filter((node) => node.kind !== "end");
    graph.edges = graph.edges.filter((edge) => !edge.target.startsWith("end_"));
    expect(errorsOf(graph, context)).toContain(
      "The workflow needs at least one End step.",
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

  it("flags an outcome wired to two steps that both continue", () => {
    const { graph, context, outcomes } = buildGraph();
    graph.edges.push({
      id: "dup",
      source: "stage_hod",
      sourceHandle: outcomes.reject.id,
      target: "end_approved",
    });
    expect(errorsOf(graph, context)).toContain(
      'Outcome "Reject" on "HOD Review" leads to "Rejected" and "Approved". Only email steps may run alongside the one that continues.',
    );
  });

  it("accepts an outcome that fans out to several email steps", () => {
    const { graph, context, outcomes } = buildGraph();
    graph.nodes.push({
      id: "email_extra",
      kind: "email",
      position: { x: 0, y: 0 },
      data: {
        label: "Copy the registrar",
        description: "",
        templateId: TEMPLATE_ACK,
        recipientMode: "custom",
        recipientRoleId: null,
        recipientEmail: "registrar@manipal.edu",
      },
    });
    graph.edges.push({
      id: "e_extra",
      source: "stage_hod",
      sourceHandle: outcomes.approve.id,
      target: "email_extra",
    });

    expect(errorsOf(graph, context)).toEqual([]);
  });

  it("flags an outcome that only sends email and never continues", () => {
    const { graph, context } = buildGraph();
    // e3 is the Approve outcome's continuation; only its email branch is left.
    graph.edges = graph.edges.filter((edge) => edge.id !== "e3");
    expect(errorsOf(graph, context)).toContain(
      'Outcome "Approve" on "HOD Review" only sends email. It also needs a step that carries the application forward.',
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

  it("refuses to let an email node continue the workflow", () => {
    const { graph, context } = buildGraph();
    graph.edges.push({
      id: "bad_email_out",
      source: "email_ack",
      sourceHandle: "out",
      target: "stage_hod",
    });
    expect(errorsOf(graph, context)).toContain(
      '"Acknowledge" cannot lead anywhere. Email is sent in the background, so it runs alongside the step that continues rather than in front of it.',
    );
  });

  it("warns about an email node nothing triggers", () => {
    const { graph, context } = buildGraph();
    graph.edges = graph.edges.filter((edge) => edge.id !== "e2");
    const issues = validateGraph(graph, context);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        message: '"Acknowledge" is never triggered by anything.',
      }),
    );
    // A stranded email step is untidy, not a reason to block publishing.
    expect(hasBlockingIssues(issues)).toBe(false);
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
      '"Approved" closes the application, so it cannot lead anywhere.',
    );
  });

  it("flags duplicate field keys inside one form", () => {
    const { graph, context } = buildGraph();
    const start = startNode(graph)!;
    const section = start.data.form.sections[0];
    section.fields.push({ ...section.fields[0], id: "dup" });
    expect(errorsOf(graph, context)).toContain(
      '"Applicant Submission" has two questions using the key "full_name".',
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
        message: '"Orphan" cannot be reached from the submission form.',
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
    expect(ordered).not.toContain("email_approved");
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
    expect(incomingEdges(graph, "end_rejected").map((e) => e.id)).toEqual([
      "e4",
    ]);
    // The submission node is re-entered by the send-back loop.
    expect(incomingEdges(graph, "start").map((e) => e.id)).toEqual(["e5"]);
  });
});
