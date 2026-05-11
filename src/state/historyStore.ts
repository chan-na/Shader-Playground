// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + length-guarded undo/redo stack access
import { create } from "zustand";
import type { GraphEdge, GraphNode } from "../core/graph/types";
import type { NodePosition } from "./types";

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Record<string, NodePosition>;
}

const MAX_HISTORY = 100;

export interface HistoryState {
  past: GraphSnapshot[];
  future: GraphSnapshot[];
  /** Suppress the next snapshot push (used when applying undo/redo). */
  suppressNext: boolean;

  push: (snap: GraphSnapshot) => void;
  undo: () => GraphSnapshot | null;
  redo: () => GraphSnapshot | null;
  clear: () => void;
}

function cloneSnapshot(s: GraphSnapshot): GraphSnapshot {
  return {
    nodes: s.nodes.map((n) => ({ ...n })),
    edges: s.edges.map((e) => ({ ...e })),
    positions: Object.fromEntries(
      Object.entries(s.positions).map(([k, v]) => [k, { x: v.x, y: v.y }]),
    ),
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  suppressNext: false,
  push: (snap) => {
    if (get().suppressNext) {
      set({ suppressNext: false });
      return;
    }
    set((s) => {
      const next = [...s.past, cloneSnapshot(snap)];
      while (next.length > MAX_HISTORY) next.shift();
      return { past: next, future: [] };
    });
  },
  undo: () => {
    const s = get();
    if (s.past.length === 0) return null;
    const head = s.past[s.past.length - 1]!;
    set({
      past: s.past.slice(0, -1),
      future: [head, ...s.future],
      suppressNext: true,
    });
    if (s.past.length >= 2) return cloneSnapshot(s.past[s.past.length - 2]!);
    // Past is now empty — return an empty snapshot to restore.
    return { nodes: [], edges: [], positions: {} };
  },
  redo: () => {
    const s = get();
    if (s.future.length === 0) return null;
    const head = s.future[0]!;
    set({
      past: [...s.past, cloneSnapshot(head)],
      future: s.future.slice(1),
      suppressNext: true,
    });
    return cloneSnapshot(head);
  },
  clear: () => set({ past: [], future: [], suppressNext: false }),
}));
