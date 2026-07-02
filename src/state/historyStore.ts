import { create } from "zustand";
import type { ParentsMap } from "../core/graph/parents";
import type { GraphEdge, GraphNode } from "../core/graph/types";
import type { NodePosition } from "./types";

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Record<string, NodePosition>;
  /**
   * Child → parent group id. Absent ⇒ top-level. Tracked here so undo of a
   * group/ungroup operation also restores the parent assignments.
   */
  parents: ParentsMap;
}

const MAX_HISTORY = 100;

export interface HistoryState {
  past: GraphSnapshot[];
  future: GraphSnapshot[];

  push: (snap: GraphSnapshot) => void;
  /**
   * Restore the most recent past snapshot. The caller passes the *current* live
   * snapshot so it can be moved onto the redo stack — the store never fabricates
   * "the present" from `past`. Returns the snapshot to apply, or null when there
   * is nothing to undo.
   */
  undo: (current: GraphSnapshot) => GraphSnapshot | null;
  /** Mirror of {@link undo}: replays the most recently undone snapshot. */
  redo: (current: GraphSnapshot) => GraphSnapshot | null;
  clear: () => void;
}

function cloneSnapshot(s: GraphSnapshot): GraphSnapshot {
  return {
    nodes: s.nodes.map((n) => ({ ...n })),
    edges: s.edges.map((e) => ({ ...e })),
    positions: Object.fromEntries(
      Object.entries(s.positions).map(([k, v]) => [k, { x: v.x, y: v.y }]),
    ),
    parents: { ...s.parents },
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  push: (snap) => {
    set((s) => {
      const next = [...s.past, cloneSnapshot(snap)];
      while (next.length > MAX_HISTORY) next.shift();
      return { past: next, future: [] };
    });
  },
  undo: (current) => {
    const s = get();
    const target = s.past[s.past.length - 1];
    if (target === undefined) return null;
    set({
      past: s.past.slice(0, -1),
      future: [cloneSnapshot(current), ...s.future],
    });
    return cloneSnapshot(target);
  },
  redo: (current) => {
    const s = get();
    const target = s.future[0];
    if (target === undefined) return null;
    set({
      past: [...s.past, cloneSnapshot(current)],
      future: s.future.slice(1),
    });
    return cloneSnapshot(target);
  },
  clear: () => set({ past: [], future: [] }),
}));
