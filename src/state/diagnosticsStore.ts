import { create } from "zustand";
import type { GLSLDiagnostic } from "../core/graph/diagnostics";

export interface NodeDiagnostics {
  vertex: GLSLDiagnostic[];
  fragment: GLSLDiagnostic[];
  link: GLSLDiagnostic[];
  /**
   * The vertex source these diagnostics were actually produced from
   * (ExecutionPlan.compiledVertexSource). Differs from the node's own
   * `vertexSource` when the node compiled as a fullscreen pass, so anything
   * resolving a vertex-stage line number to source text must prefer this.
   * Absent for nodes that never reached the compiler.
   */
  compiledVertexSource?: string;
}

export interface DiagnosticsState {
  byNode: Record<string, NodeDiagnostics>;
  set: (nodeId: string, diags: NodeDiagnostics) => void;
  clear: (nodeId: string) => void;
  /**
   * Drop diagnostics for every node not in `nodeIds`. Called after each
   * recompile so deleting a node with compile errors doesn't leave a phantom
   * ProblemsPanel row / inflated badge behind.
   */
  retainOnly: (nodeIds: string[]) => void;
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
  retainOnly: (nodeIds) =>
    set((s) => {
      const keep = new Set(nodeIds);
      let changed = false;
      const byNode: Record<string, NodeDiagnostics> = {};
      for (const [id, diags] of Object.entries(s.byNode)) {
        if (keep.has(id)) byNode[id] = diags;
        else changed = true;
      }
      // Preserve the identity when nothing was pruned so subscribers don't
      // re-render on every recompile.
      return changed ? { byNode } : s;
    }),
  reset: () => set({ byNode: {} }),
}));

export function emptyDiagnostics(): NodeDiagnostics {
  return { vertex: [], fragment: [], link: [] };
}
