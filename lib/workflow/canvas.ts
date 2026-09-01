/**
 * Pure helpers for translating canvas events into domain-graph edits.
 *
 * Kept free of React and of the canvas library so the rules the builder relies
 * on can be exercised directly in unit tests.
 */

export type CanvasPosition = { x: number; y: number };

/** The subset of a React Flow node change this module cares about. */
export type CanvasNodeChange =
  | {
      type: "position";
      id: string;
      position?: CanvasPosition;
      /** True while the pointer is still down. */
      dragging?: boolean;
    }
  | { type: "remove"; id: string }
  | { type: string; id?: string };

export type NodeChangeSummary = {
  /** Latest position seen for each node touched by this batch. */
  moves: Record<string, CanvasPosition>;
  removals: string[];
  /**
   * True once the movement has come to rest - the pointer was released, or the
   * move came from something instantaneous such as a keyboard nudge. Only then
   * should positions be written into the domain graph: committing every
   * intermediate frame re-runs validation and rebuilds every node object,
   * which makes the canvas flicker.
   */
  settled: boolean;
};

export function summariseNodeChanges(
  changes: readonly CanvasNodeChange[],
): NodeChangeSummary {
  const moves: Record<string, CanvasPosition> = {};
  const removals: string[] = [];
  let settled = false;

  for (const change of changes) {
    if (change.type === "position") {
      const positioned = change as Extract<
        CanvasNodeChange,
        { type: "position" }
      >;
      if (!positioned.position || !positioned.id) continue;
      moves[positioned.id] = positioned.position;
      if (!positioned.dragging) settled = true;
    } else if (change.type === "remove" && change.id) {
      removals.push(change.id);
    }
  }

  return { moves, removals, settled };
}

export function hasMoves(summary: NodeChangeSummary): boolean {
  return Object.keys(summary.moves).length > 0;
}
