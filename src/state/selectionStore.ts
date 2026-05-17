import { create } from "zustand";

export interface SelectionState {
  /** Full selection set, in the order nodes were added. */
  selectedNodeIds: string[];
  /**
   * Primary selection — the last id added to the set, or null.
   * Inspector / CodeEditor focus on a single node, so they read this.
   */
  selectedNodeId: string | null;
  /** Single-select: collapse the set to one id (or clear). */
  select: (id: string | null) => void;
  /** Multi-select: replace the whole set. Primary becomes the last entry. */
  setSelectedIds: (ids: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeIds: [],
  selectedNodeId: null,
  select: (id) =>
    set({
      selectedNodeIds: id ? [id] : [],
      selectedNodeId: id ?? null,
    }),
  setSelectedIds: (ids) =>
    set({
      selectedNodeIds: ids,
      selectedNodeId: ids[ids.length - 1] ?? null,
    }),
}));
