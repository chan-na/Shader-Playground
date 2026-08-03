import { create } from "zustand";

/**
 * Plan-summary rows for the Pass Inspector (T1/D-1). A **leaf store**: it
 * imports no other store and no `core/` module (types are declared inline
 * rather than imported from `core/graph/compile`) so it stays outside the
 * store dependency graph — the same discipline `diagnosticsStore.ts` and
 * `debugUiStore.ts` follow. `src/ui/Viewport/passPlanPublish.ts` is the only
 * place that knows how to turn an `ExecutionPlan` into these rows; this store
 * just holds whatever it's handed.
 */
export interface ShaderPassRow {
  kind: "shader";
  nodeId: string;
  width: number;
  height: number;
  resolutionScale: number;
  meshIsFullscreen: boolean;
  /**
   * "fullscreen quad" | primitive name | asset name. Empty string when the
   * mesh is compute-driven — the Pass Inspector should render the driving
   * ComputeNode's own row instead (via `meshComputeNodeId`) rather than a
   * label here.
   */
  meshLabel: string;
  meshComputeNodeId: string | null;
  samplers: ReadonlyArray<{
    uniformName: string;
    sourceNodeId: string;
    unit: number;
  }>;
  /**
   * Per-attribute record of whether this pass's linked program actually
   * bound each of the mesh's attributes (B-2, `docs/learnability-plan-2026-08.md`
   * T2). Mirrors `ShaderPass.meshAttributeUse` from `core/graph/compile.ts` —
   * declared inline rather than imported to keep this a leaf store. Empty for
   * fullscreen-substituted or compute-driven passes.
   */
  meshAttributeUse: ReadonlyArray<{
    name: string;
    size: number;
    consumed: boolean;
  }>;
  /**
   * Uniforms this pass declared but that the compiled/linked program or the
   * graph's wiring silently disagrees with (E-1, T2) — an unconnected
   * sampler, or a uniform absent from the linked program. Mirrors
   * `SilentUniformWarning` from `core/graph/silentUniforms.ts`, declared
   * inline for the same leaf-store reason as `meshAttributeUse` above.
   */
  silentWarnings: ReadonlyArray<{
    uniformName: string;
    kind: "sampler-unconnected" | "uniform-inactive";
  }>;
}

export interface ComputePassRow {
  kind: "compute";
  nodeId: string;
  count: number;
  primitiveLabel: string;
  /**
   * Closure over the *live* ComputePass object's `read` field. Row summaries
   * are only rebuilt on recompile, but the ping-pong `read` side flips every
   * frame — publishing a fresh snapshot each frame would mean a store write
   * (and subscriber re-render) on the RAF hot path. Instead the closure is
   * pulled only when something actually reads it (e.g. the Pass Inspector
   * re-renders on its own timer/visibility), so the store itself never
   * republishes between recompiles.
   */
  getRead: () => "A" | "B";
}

export type PassRow = ShaderPassRow | ComputePassRow;

/**
 * Per-varying row of a shader node's vertex↔fragment contract (A-2, T4).
 * Mirrors `VaryingRow` from `core/glsl/varyingContract.ts` — declared inline
 * rather than imported, for the same leaf-store reason as `meshAttributeUse`/
 * `silentWarnings` above.
 */
export interface NodeVaryingRow {
  name: string;
  vertexType: string | null;
  fragmentType: string | null;
  fragmentUsed: boolean;
  fragmentLine?: number;
  status: "linked" | "unused" | "missing-out" | "type-mismatch";
}

/**
 * Mirrors `VaryingContract` from `core/glsl/varyingContract.ts`, declared
 * inline for the same leaf-store reason as `NodeVaryingRow` above.
 */
export interface NodeVaryings {
  rows: ReadonlyArray<NodeVaryingRow>;
  confident: boolean;
}

export interface PassPlanState {
  rows: PassRow[];
  fullscreenByNode: Record<string, boolean>;
  varyingsByNode: Record<string, NodeVaryings>;
  publish: (
    rows: PassRow[],
    fullscreenByNode: Record<string, boolean>,
    varyingsByNode: Record<string, NodeVaryings>,
  ) => void;
  /**
   * Drop rows/records for nodes no longer in the graph. Mirrors
   * `diagnosticsStore.retainOnly`'s identity-preservation: when nothing is
   * pruned the previous array/object references are kept so subscribers
   * don't re-render on every recompile.
   */
  retainOnly: (nodeIds: string[]) => void;
  reset: () => void;
}

export const usePassPlanStore = create<PassPlanState>((set) => ({
  rows: [],
  fullscreenByNode: {},
  varyingsByNode: {},
  publish: (rows, fullscreenByNode, varyingsByNode) =>
    set({ rows, fullscreenByNode, varyingsByNode }),
  retainOnly: (nodeIds) =>
    set((s) => {
      const keep = new Set(nodeIds);
      let rowsChanged = false;
      const rows = s.rows.filter((r) => {
        const ok = keep.has(r.nodeId);
        if (!ok) rowsChanged = true;
        return ok;
      });
      let recordChanged = false;
      const fullscreenByNode: Record<string, boolean> = {};
      for (const [id, v] of Object.entries(s.fullscreenByNode)) {
        if (keep.has(id)) fullscreenByNode[id] = v;
        else recordChanged = true;
      }
      let varyingsChanged = false;
      const varyingsByNode: Record<string, NodeVaryings> = {};
      for (const [id, v] of Object.entries(s.varyingsByNode)) {
        if (keep.has(id)) varyingsByNode[id] = v;
        else varyingsChanged = true;
      }
      if (!rowsChanged && !recordChanged && !varyingsChanged) return s;
      return {
        rows: rowsChanged ? rows : s.rows,
        fullscreenByNode: recordChanged ? fullscreenByNode : s.fullscreenByNode,
        varyingsByNode: varyingsChanged ? varyingsByNode : s.varyingsByNode,
      };
    }),
  reset: () => set({ rows: [], fullscreenByNode: {}, varyingsByNode: {} }),
}));
