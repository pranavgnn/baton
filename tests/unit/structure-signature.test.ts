import { describe, expect, it } from "vitest";

import { canEditForms, SUPER_ADMIN_PERMISSION } from "@/lib/auth/permissions";
import { createField, createSection } from "@/lib/workflow/defaults";
import { structureSignature } from "@/lib/workflow/graph";
import { buildGraph } from "./fixtures";

/**
 * The signature is what stops someone with `forms.manage` but not
 * `workflow.manage` from reshaping the process: their saved graph has to match
 * the stored one on everything except the forms.
 */
describe("structureSignature", () => {
  it("ignores changes to a form", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    const start = graph.nodes.find((node) => node.id === "start")!;
    if (start.kind === "start") {
      start.data.form.sections.push(
        createSection("Extra questions", [
          createField({ type: "text", key: "extra", label: "Extra" }),
        ]),
      );
    }

    expect(structureSignature(graph)).toBe(before);
  });

  it("ignores a node being renamed or moved", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    const stage = graph.nodes.find((node) => node.id === "stage_hod")!;
    stage.data.label = "Departmental Review";
    stage.data.description = "Reworded.";
    stage.position = { x: 999, y: 999 };

    expect(structureSignature(graph)).toBe(before);
  });

  it("ignores the order nodes and edges happen to be stored in", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    graph.nodes.reverse();
    graph.edges.reverse();

    expect(structureSignature(graph)).toBe(before);
  });

  it("notices a node being added", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    graph.nodes.push({
      id: "sneaky",
      kind: "end",
      position: { x: 0, y: 0 },
      data: { label: "Approved", description: "", result: "approved" },
    });

    expect(structureSignature(graph)).not.toBe(before);
  });

  it("notices a node being removed", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    graph.nodes = graph.nodes.filter((node) => node.id !== "email_ack");

    expect(structureSignature(graph)).not.toBe(before);
  });

  it("notices a connection being rerouted", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    const edge = graph.edges.find((entry) => entry.id === "e4")!;
    edge.target = "end_approved";

    expect(structureSignature(graph)).not.toBe(before);
  });

  it("notices a stage being handed to a different role", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    const stage = graph.nodes.find((node) => node.id === "stage_hod")!;
    if (stage.kind === "stage") stage.data.roleId = "role-someone-else";

    expect(structureSignature(graph)).not.toBe(before);
  });

  it("notices an outcome being added", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    const stage = graph.nodes.find((node) => node.id === "stage_hod")!;
    if (stage.kind === "stage") {
      stage.data.outcomes.push({
        id: "out_new",
        label: "Defer",
        tone: "neutral",
        requiresForm: true,
      });
    }

    expect(structureSignature(graph)).not.toBe(before);
  });

  it("notices an email step being pointed at another recipient", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    const email = graph.nodes.find((node) => node.id === "email_ack")!;
    if (email.kind === "email") {
      email.data.recipientMode = "custom";
      email.data.recipientEmail = "elsewhere@example.com";
    }

    expect(structureSignature(graph)).not.toBe(before);
  });

  it("notices an end node's outcome being flipped", () => {
    const { graph } = buildGraph();
    const before = structureSignature(graph);

    const end = graph.nodes.find((node) => node.id === "end_approved")!;
    if (end.kind === "end") end.data.result = "rejected";

    expect(structureSignature(graph)).not.toBe(before);
  });
});

describe("canEditForms", () => {
  it("lets a dedicated form editor in", () => {
    expect(canEditForms(["forms.manage"])).toBe(true);
  });

  it("lets a workflow administrator in without a separate grant", () => {
    // Someone who can delete the step outright is not restrained by being kept
    // out of its form.
    expect(canEditForms(["workflow.manage"])).toBe(true);
  });

  it("keeps everyone else out", () => {
    expect(canEditForms(["templates.manage"])).toBe(false);
    expect(canEditForms([])).toBe(false);
  });

  it("respects the super admin wildcard", () => {
    expect(canEditForms([SUPER_ADMIN_PERMISSION])).toBe(true);
  });
});
