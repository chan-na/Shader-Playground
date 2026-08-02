import { glPrimitiveLabel } from "../../core/gl/primitiveLabel";
import type { ExecutionPlan } from "../../core/graph/compile";
import { computeSilentUniformWarnings } from "../../core/graph/silentUniforms";
import type {
  Graph,
  MeshGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import { parseUniforms } from "../../core/graph/uniformParser";
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
 * Kept deliberately shallow: `pass.samplers` and `pass.meshAttributeUse` are
 * reused by reference rather than copied, and every other field is a
 * primitive read straight off the pass/node — recompile already runs on
 * every structural graph edit, so allocating a second nested copy of pass
 * state here would add avoidable GC pressure on top of that. `silentWarnings`
 * is the one field genuinely computed here (E-1, T2): it's a `parseUniforms`
 * pass plus a small set diff, cheap enough at recompile frequency (not a RAF
 * hot path — see `Viewport/index.tsx`'s `recompile`).
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
    const shaderNode =
      node && node.kind === "shader" ? (node as ShaderGraphNode) : null;
    const resolutionScale = shaderNode?.resolutionScale ?? 1;
    // Declared-uniform set for E-1 is read from the *compiled* vertex source
    // (plan.compiledVertexSource), not node.vertexSource — a fullscreen-
    // substituted node's user vertex declarations never reached the GL
    // compiler, so asserting against them would manufacture warning noise
    // (see compile.ts:144-153's doc on why compiledVertexSource exists).
    const silentWarnings = shaderNode
      ? computeSilentUniformWarnings(
          parseUniforms(
            `${plan.compiledVertexSource[pass.nodeId] ?? ""}\n${shaderNode.fragmentSource}`,
          ),
          new Set(Object.keys(pass.program.uniforms)),
          new Set([
            ...pass.samplers.map((s) => s.uniformName),
            ...pass.paramBindings.map((p) => p.uniformName),
          ]),
        )
      : [];
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
      meshAttributeUse: pass.meshAttributeUse,
      silentWarnings,
    });
  }
  return rows;
}
