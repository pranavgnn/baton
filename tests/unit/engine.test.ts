import { describe, expect, it } from "vitest";

import {
  classifyDestination,
  resolveSubmission,
  resolveTransition,
} from "@/lib/workflow/engine";
import { nodeById } from "@/lib/workflow/graph";
import { buildGraph, TEMPLATE_ACK } from "./fixtures";

describe("resolveTransition", () => {
  it("fires past email nodes and rests on the next stage", () => {
    const { graph } = buildGraph();
    const result = resolveSubmission(graph, "start");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emails.map((node) => node.id)).toEqual(["email_ack"]);
    expect(result.destination.id).toBe("stage_hod");
  });

  it("routes each outcome to its own target", () => {
    const { graph, outcomes } = buildGraph();

    const approved = resolveTransition(graph, "stage_hod", outcomes.approve.id);
    expect(approved.ok && approved.destination.id).toBe("end_approved");
    expect(approved.ok && approved.emails.map((n) => n.id)).toEqual([
      "email_approved",
    ]);

    const rejected = resolveTransition(graph, "stage_hod", outcomes.reject.id);
    expect(rejected.ok && rejected.destination.id).toBe("end_rejected");
    expect(rejected.ok && rejected.emails).toEqual([]);
  });

  it("sends the application back to the start node through an email step", () => {
    const { graph, outcomes } = buildGraph();
    const result = resolveTransition(graph, "stage_hod", outcomes.sendBack.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emails.map((node) => node.id)).toEqual(["email_back"]);
    expect(result.destination.kind).toBe("start");
  });

  it("chains consecutive email nodes in order", () => {
    const { graph, outcomes } = buildGraph();
    graph.nodes.push({
      id: "email_second",
      kind: "email",
      position: { x: 0, y: 0 },
      data: {
        label: "Second",
        description: "",
        templateId: TEMPLATE_ACK,
        recipientMode: "applicant",
        recipientRoleId: null,
        recipientEmail: "",
      },
    });
    graph.edges = graph.edges.filter((edge) => edge.id !== "e7");
    graph.edges.push(
      {
        id: "c1",
        source: "email_approved",
        sourceHandle: "out",
        target: "email_second",
      },
      {
        id: "c2",
        source: "email_second",
        sourceHandle: "out",
        target: "end_approved",
      },
    );

    const result = resolveTransition(graph, "stage_hod", outcomes.approve.id);
    expect(result.ok && result.emails.map((n) => n.id)).toEqual([
      "email_approved",
      "email_second",
    ]);
    expect(result.ok && result.destination.id).toBe("end_approved");
  });

  it("refuses an outcome the stage does not define", () => {
    const { graph } = buildGraph();
    const result = resolveTransition(graph, "stage_hod", "made-up");
    expect(result).toEqual({
      ok: false,
      error: "That outcome is not available.",
    });
  });

  it("refuses to leave a node that no longer exists", () => {
    const { graph } = buildGraph();
    const result = resolveTransition(graph, "ghost", "out");
    expect(result).toEqual({
      ok: false,
      error: "The current step no longer exists.",
    });
  });

  it("reports a disconnected outcome instead of silently stalling", () => {
    const { graph, outcomes } = buildGraph();
    graph.edges = graph.edges.filter(
      (edge) => edge.sourceHandle !== outcomes.reject.id,
    );
    const result = resolveTransition(graph, "stage_hod", outcomes.reject.id);
    expect(result).toEqual({
      ok: false,
      error: "This step is not connected to a next step.",
    });
  });

  it("reports an email step that leads nowhere", () => {
    const { graph } = buildGraph();
    graph.edges = graph.edges.filter((edge) => edge.id !== "e2");
    const result = resolveSubmission(graph, "start");
    expect(result).toEqual({
      ok: false,
      error: '"Acknowledge" is not connected to a next step.',
    });
  });

  it("bails out of an infinite email loop rather than hanging", () => {
    const { graph } = buildGraph();
    graph.edges = graph.edges.filter((edge) => edge.id !== "e2");
    graph.edges.push({
      id: "self",
      source: "email_ack",
      sourceHandle: "out",
      target: "email_ack",
    });

    const result = resolveSubmission(graph, "start");
    expect(result).toEqual({
      ok: false,
      error: "The workflow loops through email steps without ever stopping.",
    });
  });
});

describe("classifyDestination", () => {
  it("maps end nodes to their configured result", () => {
    const { graph } = buildGraph();
    expect(classifyDestination(nodeById(graph, "end_approved")!)).toEqual({
      kind: "finished",
      nodeId: "end_approved",
      result: "approved",
    });
    expect(classifyDestination(nodeById(graph, "end_rejected")!)).toEqual({
      kind: "finished",
      nodeId: "end_rejected",
      result: "rejected",
    });
  });

  it("maps the start node to a return to the applicant", () => {
    const { graph } = buildGraph();
    expect(classifyDestination(nodeById(graph, "start")!)).toEqual({
      kind: "returned_to_applicant",
      nodeId: "start",
    });
  });

  it("maps a stage to waiting for a reviewer", () => {
    const { graph } = buildGraph();
    expect(classifyDestination(nodeById(graph, "stage_hod")!)).toEqual({
      kind: "awaiting_stage",
      nodeId: "stage_hod",
    });
  });
});
