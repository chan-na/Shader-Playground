import { create } from "zustand";
import type { GLSLDiagnostic } from "../core/graph/diagnostics";

export interface NodeDiagnostics {
  vertex: GLSLDiagnostic[];
  fragment: GLSLDiagnostic[];
  link: GLSLDiagnostic[];
}

export interface DiagnosticsState {
  byNode: Record<string, NodeDiagnostics>;
  set: (nodeId: string, diags: NodeDiagnostics) => void;
  clear: (nodeId: string) => void;
  reset: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  byNode: {},
  set: (nodeId, diags) =>
    set((s) => ({ byNode: { ...s.byNode, [nodeId]: diags } })),
  clear: (nodeId) =>
    set((s) => {
      const byNode = { ...s.byNode };
      delete byNode[nodeId];
      return { byNode };
    }),
  reset: () => set({ byNode: {} }),
}));

export function emptyDiagnostics(): NodeDiagnostics {
  return { vertex: [], fragment: [], link: [] };
}
