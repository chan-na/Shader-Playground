import { beforeEach, describe, expect, it } from "vitest";
import type { GraphSnapshot } from "./historyStore";
import { useHistoryStore } from "./historyStore";

function snap(n: number): GraphSnapshot {
  return {
    nodes: [{ id: `n${n}`, kind: "output" }],
    edges: [],
    positions: {},
  };
}

describe("historyStore", () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  it("undo returns previous snapshot", () => {
    const h = useHistoryStore.getState();
    h.push(snap(1));
    h.push(snap(2));
    h.push(snap(3));

    const undone = useHistoryStore.getState().undo()!;
    expect(undone.nodes[0]!.id).toBe("n2");
  });

  it("redo restores undone snapshot", () => {
    const h = useHistoryStore.getState();
    h.push(snap(1));
    h.push(snap(2));
    useHistoryStore.getState().undo();
    const redone = useHistoryStore.getState().redo()!;
    expect(redone.nodes[0]!.id).toBe("n2");
  });

  it("undo on empty history returns null", () => {
    expect(useHistoryStore.getState().undo()).toBeNull();
  });

  it("push after undo clears the redo stack", () => {
    const h = useHistoryStore.getState();
    h.push(snap(1));
    h.push(snap(2));
    useHistoryStore.getState().undo(); // pop to snap1
    // Need to reset suppress flag so push below actually lands
    useHistoryStore.setState({ suppressNext: false });
    useHistoryStore.getState().push(snap(3));
    expect(useHistoryStore.getState().future).toEqual([]);
  });

  it("respects MAX_HISTORY cap (last 100)", () => {
    const h = useHistoryStore.getState();
    for (let i = 0; i < 150; i++) h.push(snap(i));
    expect(useHistoryStore.getState().past.length).toBeLessThanOrEqual(100);
  });

  it("suppressNext blocks one push", () => {
    const h = useHistoryStore.getState();
    h.push(snap(1));
    useHistoryStore.setState({ suppressNext: true });
    h.push(snap(2));
    expect(useHistoryStore.getState().past.length).toBe(1);
  });
});
