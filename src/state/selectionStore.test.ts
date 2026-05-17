import { beforeEach, describe, expect, it } from "vitest";
import { useSelectionStore } from "./selectionStore";

describe("selectionStore", () => {
  beforeEach(() => {
    useSelectionStore.getState().select(null);
  });

  it("starts with no selection", () => {
    expect(useSelectionStore.getState().selectedNodeId).toBeNull();
    expect(useSelectionStore.getState().selectedNodeIds).toEqual([]);
  });

  it("select changes the current selection", () => {
    useSelectionStore.getState().select("node-42");
    expect(useSelectionStore.getState().selectedNodeId).toBe("node-42");
    expect(useSelectionStore.getState().selectedNodeIds).toEqual(["node-42"]);
    useSelectionStore.getState().select(null);
    expect(useSelectionStore.getState().selectedNodeId).toBeNull();
    expect(useSelectionStore.getState().selectedNodeIds).toEqual([]);
  });

  it("setSelectedIds holds the full set and exposes the last as primary", () => {
    useSelectionStore.getState().setSelectedIds(["a", "b", "c"]);
    const s = useSelectionStore.getState();
    expect(s.selectedNodeIds).toEqual(["a", "b", "c"]);
    expect(s.selectedNodeId).toBe("c");
  });

  it("setSelectedIds([]) clears the primary too", () => {
    useSelectionStore.getState().setSelectedIds(["a", "b"]);
    useSelectionStore.getState().setSelectedIds([]);
    expect(useSelectionStore.getState().selectedNodeIds).toEqual([]);
    expect(useSelectionStore.getState().selectedNodeId).toBeNull();
  });

  it("select(id) collapses an existing multi-set to a single entry", () => {
    useSelectionStore.getState().setSelectedIds(["a", "b"]);
    useSelectionStore.getState().select("c");
    expect(useSelectionStore.getState().selectedNodeIds).toEqual(["c"]);
    expect(useSelectionStore.getState().selectedNodeId).toBe("c");
  });
});
