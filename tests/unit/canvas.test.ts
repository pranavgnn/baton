import { describe, expect, it } from "vitest";

import {
  hasMoves,
  summariseNodeChanges,
  type CanvasNodeChange,
} from "@/lib/workflow/canvas";

const at = (x: number, y: number) => ({ x, y });

describe("summariseNodeChanges", () => {
  it("holds a drag in progress back from the domain graph", () => {
    const summary = summariseNodeChanges([
      { type: "position", id: "a", position: at(10, 20), dragging: true },
    ]);

    expect(summary.moves).toEqual({ a: at(10, 20) });
    expect(summary.settled).toBe(false);
    expect(hasMoves(summary)).toBe(true);
  });

  it("settles once the pointer is released", () => {
    const summary = summariseNodeChanges([
      { type: "position", id: "a", position: at(10, 20), dragging: false },
    ]);

    expect(summary.settled).toBe(true);
  });

  it("treats an instantaneous move as settled", () => {
    // Keyboard nudges arrive with no `dragging` flag at all.
    const summary = summariseNodeChanges([
      { type: "position", id: "a", position: at(1, 1) },
    ]);

    expect(summary.settled).toBe(true);
  });

  it("keeps only the latest position for a node in one batch", () => {
    const summary = summariseNodeChanges([
      { type: "position", id: "a", position: at(1, 1), dragging: true },
      { type: "position", id: "a", position: at(2, 2), dragging: true },
      { type: "position", id: "a", position: at(3, 3), dragging: true },
    ]);

    expect(summary.moves).toEqual({ a: at(3, 3) });
  });

  it("carries every node of a multi-select drag", () => {
    const summary = summariseNodeChanges([
      { type: "position", id: "a", position: at(1, 1), dragging: false },
      { type: "position", id: "b", position: at(2, 2), dragging: false },
    ]);

    expect(summary.moves).toEqual({ a: at(1, 1), b: at(2, 2) });
    expect(summary.settled).toBe(true);
  });

  it("collects removals", () => {
    const summary = summariseNodeChanges([
      { type: "remove", id: "a" },
      { type: "remove", id: "b" },
    ]);

    expect(summary.removals).toEqual(["a", "b"]);
    expect(hasMoves(summary)).toBe(false);
  });

  it("ignores the measurement and selection chatter", () => {
    const changes: CanvasNodeChange[] = [
      { type: "dimensions", id: "a" },
      { type: "select", id: "a" },
      { type: "replace", id: "a" },
    ];
    const summary = summariseNodeChanges(changes);

    expect(summary).toEqual({ moves: {}, removals: [], settled: false });
    expect(hasMoves(summary)).toBe(false);
  });

  it("ignores a position change that carries no position", () => {
    const summary = summariseNodeChanges([
      { type: "position", id: "a", dragging: true },
    ]);

    expect(hasMoves(summary)).toBe(false);
    expect(summary.settled).toBe(false);
  });

  it("reports moves and removals arriving together", () => {
    const summary = summariseNodeChanges([
      { type: "position", id: "a", position: at(5, 5), dragging: false },
      { type: "remove", id: "b" },
    ]);

    expect(summary.moves).toEqual({ a: at(5, 5) });
    expect(summary.removals).toEqual(["b"]);
    expect(summary.settled).toBe(true);
  });
});
