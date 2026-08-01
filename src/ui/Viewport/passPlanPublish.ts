import { glPrimitiveLabel } from "../../core/gl/primitiveLabel";
import type { ExecutionPlan } from "../../core/graph/compile";
import type {
  Graph,
  MeshGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import type { PassRow } from "../../state/passPlanStore";

/** Minimal view of the asset catalog this module needs (just mesh names). */
export interface PassPlanAssets {
  meshes: Record<string, { name: string }>;
}

function meshSourceNode(graph: Graph, shaderNodeId: string) {
  const edge = graph.edges.find(
    (e) => e.target === shaderNodeId && e.targetHandle === "mesh",
  );
  if (!edge) return null;
  return graph.nodes.find((n) => n.id === edge.source) ?? null;
}

/**
 * Label for a shader pass's mesh input, one of:
 *  - "fullscreen quad" — the auto-substituted fullscreen pass (A-1).
 *  - "" — compute-driven; the caller renders the driving ComputeNode's own
 *    row instead of a mesh label here.
 *  - the built-in primitive name, or the loaded asset's display name.
 */
function meshLabelFor(
  graph: Graph,
  nodeId: string,
  meshIsFullscreen: boolean,
  meshComputeNodeId: string | null,
  assets: PassPlanAssets,
): string {
  if (meshIsFullscreen) return "fullscreen quad";
  if (meshComputeNodeId) return "";
  const source = meshSourceNode(graph, nodeId);
  if (!source || source.kind !== "mesh") return "";
  const mn = source as MeshGraphNode;
  if (mn.assetId) return assets.meshes[mn.assetId]?.name ?? "asset";
  return mn.primitive;
}

/**
 * Turn a compiled `ExecutionPlan` into the shallow row summary the Pass
 * Inspector (leaf `passPlanStore`) displays. Preserves `plan.passes` order,
 * which is the same topological order `executePlan` draws in.
 *
 * Kept deliberately shallow: `pass.samplers` is reused by reference rather
 * than copied, and every other field is a primitive read straight off the
 * pass/node — recompile already runs on every structural graph edit, so
 * allocating a second nested copy of pass state here would add avoidable GC
 * pressure on top of that.
 */
export function buildPassRows(
  plan: ExecutionPlan,
  graph: Graph,
  assets: PassPlanAssets,
): PassRow[] {
  const rows: PassRow[] = [];
  for (const pass of plan.passes) {
    if (pass.kind === "compute") {
      rows.push({
        kind: "compute",
        nodeId: pass.nodeId,
        count: pass.count,
        primitiveLabel: glPrimitiveLabel(pass.primitive),
        // Captures the live pass object, not a value — `read` flips every
        // frame outside of recompile, so this must stay a closure (see
        // ComputePassRow.getRead doc in passPlanStore.ts).
        getRead: () => pass.read,
      });
      continue;
    }
    const node = graph.nodes.find((n) => n.id === pass.nodeId);
    const resolutionScale =
      node && node.kind === "shader"
        ? ((node as ShaderGraphNode).resolutionScale ?? 1)
        : 1;
    rows.push({
      kind: "shader",
      nodeId: pass.nodeId,
      width: pass.width,
      height: pass.height,
      resolutionScale,
      meshIsFullscreen: pass.meshIsFullscreen,
      meshLabel: meshLabelFor(
        graph,
        pass.nodeId,
        pass.meshIsFullscreen,
        pass.meshComputeNodeId,
        assets,
      ),
      meshComputeNodeId: pass.meshComputeNodeId,
      samplers: pass.samplers,
    });
  }
  return rows;
}
