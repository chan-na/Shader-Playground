import { beforeEach, describe, expect, it } from "vitest";
import type { GraphSnapshot } from "./historyStore";
import { useHistoryStore } from "./historyStore";

function snap(n: number): GraphSnapshot {
  return {
    nodes: [{ id: `n${n}`, kind: "output" }],
    edges: [],
    positions: {},
    parents: {},
  };
}

function ids(s: GraphSnapshot | null): string[] {
  return (s?.nodes ?? []).map((n) => n.id);
}

describe("historyStore", () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  it("undo restores the top of past and moves current onto future", () => {
    const h = useHistoryStore.getState();
    // push-before-mutation flow: snap(1)/snap(2) are the pre-states recorded
    // before the graph became snap(3).
    h.push(snap(1));
    h.push(snap(2));

    const undone = useHistoryStore.getState().undo(snap(3));
    expect(ids(undone)).toEqual(["n2"]);
    expect(ids(useHistoryStore.getState().future[0] ?? null)).toEqual(["n3"]);
    expect(useHistoryStore.getState().past.map((s) => s.nodes[0]?.id)).toEqual([
      "n1",
    ]);
  });

  it("redo replays the undone snapshot and moves current back onto past", () => {
    useHistoryStore.getState().push(snap(1));
    const undone = useHistoryStore.getState().undo(snap(2));
    expect(ids(undone)).toEqual(["n1"]);
    const redone = useHistoryStore.getState().redo(snap(1));
    expect(ids(redone)).toEqual(["n2"]);
    expect(useHistoryStore.getState().future).toEqual([]);
  });

  it("undo/redo round-trips are identity-preserving", () => {
    // Emulate empty → add a → add b (each push records the pre-mutation state).
    useHistoryStore.getState().push(snap(0)); // pre-state before "a"
    useHistoryStore.getState().push(snap(1)); // pre-state before "b", live = snap(2)
    const h = () => useHistoryStore.getState();
    const u1 = h().undo(snap(2));
    expect(ids(u1)).toEqual(["n1"]);
    const u2 = h().undo(u1!);
    expect(ids(u2)).toEqual(["n0"]);
    const r1 = h().redo(u2!);
    expect(ids(r1)).toEqual(["n1"]);
    const r2 = h().redo(r1!);
    expect(ids(r2)).toEqual(["n2"]);
  });

  it("undo on empty history returns null", () => {
    expect(useHistoryStore.getState().undo(snap(1))).toBeNull();
  });

  it("redo on empty future returns null", () => {
    expect(useHistoryStore.getState().redo(snap(1))).toBeNull();
  });

  it("a push after undo clears the redo stack", () => {
    const h = useHistoryStore.getState();
    h.push(snap(1));
    h.push(snap(2));
    useHistoryStore.getState().undo(snap(3)); // future now holds snap(3)
    expect(useHistoryStore.getState().future).toHaveLength(1);
    // A fresh edit records its pre-state and must discard the diverged redo.
    useHistoryStore.getState().push(snap(4));
    expect(useHistoryStore.getState().future).toEqual([]);
  });

  it("respects MAX_HISTORY cap (last 100)", () => {
    const h = useHistoryStore.getState();
    for (let i = 0; i < 150; i++) h.push(snap(i));
    expect(useHistoryStore.getState().past.length).toBeLessThanOrEqual(100);
  });
});
