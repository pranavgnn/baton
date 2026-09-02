import { describe, expect, it } from "vitest";

import {
  classifyDestination,
  resolveSubmission,
  resolveTransition,
} from "@/lib/workflow/engine";
import { nodeById } from "@/lib/workflow/graph";
import { buildGraph, TEMPLATE_ACK } from "./fixtures";

describe("resolveTransition", () => {
  it("carries the application to the next stage and queues the email beside it", () => {
    const { graph } = buildGraph();
    const result = resolveSubmission(graph, "start");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The acknowledgement runs in parallel; it is not on the path.
    expect(result.emails.map((node) => node.id)).toEqual(["email_ack"]);
    expect(result.destination.id).toBe("stage_hod");
  });

  it("routes each outcome to its own continuation", () => {
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

  it("sends the application back to the applicant with a notification", () => {
    const { graph, outcomes } = buildGraph();
    const result = resolveTransition(graph, "stage_hod", outcomes.sendBack.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emails.map((node) => node.id)).toEqual(["email_back"]);
    expect(result.destination.kind).toBe("start");
  });

  it("collects every email branch on a handle", () => {
    const { graph, outcomes } = buildGraph();
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
        recipientScope: "all_holders",
        recipientEmail: "registrar@manipal.edu",
      },
    });
    graph.edges.push({
      id: "e_extra",
      source: "stage_hod",
      sourceHandle: outcomes.approve.id,
      target: "email_extra",
    });

    const result = resolveTransition(graph, "stage_hod", outcomes.approve.id);
    expect(result.ok && result.emails.map((n) => n.id).sort()).toEqual([
      "email_approved",
      "email_extra",
    ]);
    expect(result.ok && result.destination.id).toBe("end_approved");
  });

  it("refuses an outcome the stage does not define", () => {
    const { graph } = buildGraph();
    expect(resolveTransition(graph, "stage_hod", "made-up")).toEqual({
      ok: false,
      error: "That outcome is not available.",
    });
  });

  it("refuses to leave a node that no longer exists", () => {
    const { graph } = buildGraph();
    expect(resolveTransition(graph, "ghost", "out")).toEqual({
      ok: false,
      error: "The current step no longer exists.",
    });
  });

  it("reports a disconnected outcome instead of silently stalling", () => {
    const { graph, outcomes } = buildGraph();
    graph.edges = graph.edges.filter(
      (edge) => edge.sourceHandle !== outcomes.reject.id,
    );
    expect(resolveTransition(graph, "stage_hod", outcomes.reject.id)).toEqual({
      ok: false,
      error: "This step is not connected to a next step.",
    });
  });

  it("refuses a handle that only sends email and never continues", () => {
    const { graph, outcomes } = buildGraph();
    graph.edges = graph.edges.filter((edge) => edge.id !== "e3");

    expect(resolveTransition(graph, "stage_hod", outcomes.approve.id)).toEqual({
      ok: false,
      error:
        "This step only sends email and never continues - it needs a step that carries the application forward.",
    });
  });

  it("refuses a handle with two competing continuations", () => {
    const { graph, outcomes } = buildGraph();
    graph.edges.push({
      id: "second",
      source: "stage_hod",
      sourceHandle: outcomes.approve.id,
      target: "end_rejected",
    });

    expect(resolveTransition(graph, "stage_hod", outcomes.approve.id)).toEqual({
      ok: false,
      error:
        "This step leads to more than one next step. Only email steps may run alongside the one that continues.",
    });
  });

  it("reports an edge pointing at a deleted node", () => {
    const { graph } = buildGraph();
    graph.nodes = graph.nodes.filter((node) => node.id !== "stage_hod");

    expect(resolveSubmission(graph, "start")).toEqual({
      ok: false,
      error: "The next step no longer exists.",
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
