import { describe, expect, it } from "vitest";

import {
  buildProgressGraph,
  type TravelledStep,
} from "@/lib/workflow/progress";
import { buildGraph, ROLE_HOD } from "./fixtures";

const STARTED_AT = "2026-03-01T08:00:00.000Z";

const roleName = (roleId: string | null) =>
  roleId === ROLE_HOD ? "Head of Department" : null;

function build(travelled: TravelledStep[], currentNodeId: string | null) {
  const { graph } = buildGraph();
  return buildProgressGraph({
    graph,
    travelled,
    currentNodeId,
    roleName,
    startedAt: STARTED_AT,
  });
}

function stateOf(
  progress: ReturnType<typeof build>,
  nodeId: string,
): string | undefined {
  return progress.steps.find((step) => step.nodeId === nodeId)?.state;
}

describe("buildProgressGraph", () => {
  it("leaves email steps out entirely", () => {
    const progress = build([], "start");
    const ids = progress.steps.map((step) => step.nodeId);

    expect(ids).toContain("start");
    expect(ids).toContain("stage_hod");
    expect(ids).not.toContain("email_ack");
    expect(ids).not.toContain("email_approved");
    expect(
      progress.edges.every((edge) => !edge.target.startsWith("email_")),
    ).toBe(true);
  });

  it("shows the whole flow, not just the part already done", () => {
    const progress = build([], "start");

    // Both endings are visible from the very beginning.
    expect(stateOf(progress, "end_approved")).toBe("upcoming");
    expect(stateOf(progress, "end_rejected")).toBe("upcoming");
  });

  it("marks where the application is now", () => {
    const progress = build(
      [{ nodeId: "start", handleId: "out", at: "2026-03-01T09:00:00.000Z" }],
      "stage_hod",
    );

    expect(stateOf(progress, "start")).toBe("done");
    expect(stateOf(progress, "stage_hod")).toBe("current");
    expect(progress.currentNodeId).toBe("stage_hod");
  });

  it("highlights only the connections actually travelled", () => {
    const { graph, outcomes } = buildGraph();
    const progress = buildProgressGraph({
      graph,
      travelled: [
        { nodeId: "start", handleId: "out", at: "2026-03-02T10:00:00.000Z" },
        {
          nodeId: "stage_hod",
          handleId: outcomes.approve.id,
          at: "2026-03-03T11:00:00.000Z",
        },
      ],
      startedAt: STARTED_AT,
      currentNodeId: "end_approved",
      roleName,
    });

    const travelled = progress.edges
      .filter((edge) => edge.travelled)
      .map((edge) => `${edge.source}->${edge.target}`);

    expect(travelled).toContain("start->stage_hod");
    expect(travelled).toContain("stage_hod->end_approved");
    expect(travelled).not.toContain("stage_hod->end_rejected");
  });

  it("counts a revisit when a send-back loops the application round", () => {
    const { graph, outcomes } = buildGraph();
    const progress = buildProgressGraph({
      graph,
      travelled: [
        { nodeId: "start", handleId: "out", at: "2026-03-04T12:00:00.000Z" },
        {
          nodeId: "stage_hod",
          handleId: outcomes.sendBack.id,
          at: "2026-03-05T13:00:00.000Z",
        },
        { nodeId: "start", handleId: "out", at: "2026-03-06T14:00:00.000Z" },
      ],
      startedAt: STARTED_AT,
      currentNodeId: "stage_hod",
      roleName,
    });

    const start = progress.steps.find((step) => step.nodeId === "start")!;
    expect(start.visits).toBe(2);
    expect(start.state).toBe("done");
    expect(stateOf(progress, "stage_hod")).toBe("current");
  });

  it("keeps the loop connection in the graph so it renders as a loop", () => {
    const { graph, outcomes } = buildGraph();
    const progress = buildProgressGraph({
      graph,
      travelled: [
        { nodeId: "start", handleId: "out", at: "2026-03-07T15:00:00.000Z" },
        {
          nodeId: "stage_hod",
          handleId: outcomes.sendBack.id,
          at: "2026-03-08T16:00:00.000Z",
        },
      ],
      startedAt: STARTED_AT,
      currentNodeId: "start",
      roleName,
    });

    const loop = progress.edges.find(
      (edge) => edge.source === "stage_hod" && edge.target === "start",
    );
    expect(loop).toBeDefined();
    expect(loop?.travelled).toBe(true);
    expect(loop?.label).toBe("Send back");
  });

  it("labels each connection with the outcome that takes it", () => {
    const progress = build([], "start");
    const labels = progress.edges
      .filter((edge) => edge.source === "stage_hod")
      .map((edge) => edge.label)
      .sort();

    expect(labels).toEqual(["Approve", "Reject", "Send back"]);
  });

  it("names the role responsible for each stage", () => {
    const progress = build([], "start");
    const stage = progress.steps.find((step) => step.nodeId === "stage_hod")!;

    expect(stage.roleName).toBe("Head of Department");
    // The submission node belongs to the applicant, not a reviewing role.
    expect(
      progress.steps.find((step) => step.nodeId === "start")!.roleName,
    ).toBeNull();
  });

  it("shows a finished application resting on its ending", () => {
    const { graph, outcomes } = buildGraph();
    const progress = buildProgressGraph({
      graph,
      travelled: [
        { nodeId: "start", handleId: "out", at: "2026-03-09T17:00:00.000Z" },
        {
          nodeId: "stage_hod",
          handleId: outcomes.reject.id,
          at: "2026-03-09T18:00:00.000Z",
        },
      ],
      startedAt: STARTED_AT,
      currentNodeId: "end_rejected",
      roleName,
    });

    expect(stateOf(progress, "end_rejected")).toBe("current");
    expect(stateOf(progress, "end_approved")).toBe("upcoming");
  });
  it("dates each step it has reached", () => {
    const { graph, outcomes } = buildGraph();
    const progress = buildProgressGraph({
      graph,
      travelled: [
        { nodeId: "start", handleId: "out", at: "2026-03-01T09:00:00.000Z" },
        {
          nodeId: "stage_hod",
          handleId: outcomes.approve.id,
          at: "2026-03-04T11:30:00.000Z",
        },
      ],
      startedAt: STARTED_AT,
      currentNodeId: "end_approved",
      roleName,
    });

    const at = (nodeId: string) =>
      progress.steps.find((step) => step.nodeId === nodeId)!;

    // The submission was entered when the application was started.
    expect(at("start").enteredAt).toBe(STARTED_AT);
    expect(at("start").completedAt).toBe("2026-03-01T09:00:00.000Z");

    // A step is entered the moment the one before it was completed.
    expect(at("stage_hod").enteredAt).toBe("2026-03-01T09:00:00.000Z");
    expect(at("stage_hod").completedAt).toBe("2026-03-04T11:30:00.000Z");

    expect(at("end_approved").enteredAt).toBe("2026-03-04T11:30:00.000Z");
  });

  it("leaves a step it has not reached undated", () => {
    const progress = build([], "start");
    const rejected = progress.steps.find(
      (step) => step.nodeId === "end_rejected",
    )!;

    expect(rejected.enteredAt).toBeNull();
    expect(rejected.completedAt).toBeNull();
  });

  it("does not date the departure of a step it is still sitting on", () => {
    const progress = build(
      [{ nodeId: "start", handleId: "out", at: "2026-03-01T09:00:00.000Z" }],
      "stage_hod",
    );
    const stage = progress.steps.find((step) => step.nodeId === "stage_hod")!;

    expect(stage.enteredAt).toBe("2026-03-01T09:00:00.000Z");
    expect(stage.completedAt).toBeNull();
  });

  it("reports the latest visit when a send-back loops it round", () => {
    const { graph, outcomes } = buildGraph();
    const progress = buildProgressGraph({
      graph,
      travelled: [
        { nodeId: "start", handleId: "out", at: "2026-03-01T09:00:00.000Z" },
        {
          nodeId: "stage_hod",
          handleId: outcomes.sendBack.id,
          at: "2026-03-02T09:00:00.000Z",
        },
        { nodeId: "start", handleId: "out", at: "2026-03-03T09:00:00.000Z" },
      ],
      startedAt: STARTED_AT,
      currentNodeId: "stage_hod",
      roleName,
    });

    const start = progress.steps.find((step) => step.nodeId === "start")!;
    // The second time round, not the first.
    expect(start.enteredAt).toBe("2026-03-02T09:00:00.000Z");
    expect(start.completedAt).toBe("2026-03-03T09:00:00.000Z");

    const stage = progress.steps.find((step) => step.nodeId === "stage_hod")!;
    expect(stage.enteredAt).toBe("2026-03-03T09:00:00.000Z");
    // Left once already, but it is back here now.
    expect(stage.completedAt).toBeNull();
  });
});
