import { glPrimitiveLabel } from "../../core/gl/primitiveLabel";
import { computeVaryingContract } from "../../core/glsl/varyingContract";
import type { ExecutionPlan } from "../../core/graph/compile";
import { computeSilentUniformWarnings } from "../../core/graph/silentUniforms";
import type {
  Graph,
  MeshGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import { parseUniforms } from "../../core/graph/uniformParser";
import type { NodeVaryings, PassRow } from "../../state/passPlanStore";

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
 * hot path — see `Viewport/index.tsx`'s `recompile`). `buildVaryingContracts`
 * below is the same story for A-2 (T4): one `computeVaryingContract` call per
 * shader node, i.e. two `buildSymbolTable` passes — also recompile-frequency,
 * not RAF.
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

/**
 * Vertex↔fragment varying contract per shader node (A-2, T4), for the Pass
 * Inspector to surface via `passPlanStore.varyingsByNode`.
 *
 * Reads `plan.compiledVertexSource[node.id]` — the vertex source actually
 * handed to the GL compiler — rather than `node.vertexSource`, for the exact
 * reason `buildPassRows`'s `silentWarnings` above does the same (see its
 * comment, and `compile.ts`'s doc on `compiledVertexSource`): a fullscreen-
 * substituted node's varying contract comes from `fullscreen.vert` (which
 * only provides `v_uv`), not from the user's `basic.vert` (which also
 * provides `v_normal`/`v_world`). Asserting against the user source would
 * report those as "provided" when the compiler never saw them — exactly the
 * false reassurance this module exists to remove. `fragmentSource` is read
 * straight off the node because `compile.ts`'s `createProgram` call passes
 * the fragment source through unmodified (there is no fragment-side
 * substitution to account for).
 *
 * A node absent from `compiledVertexSource` never reached the compiler at
 * all (e.g. every shader node when `plan` is `emptyPlan` after a fatal
 * validate) and is skipped — showing a contract for a node the compiler
 * never touched would itself be a fabricated bridge.
 *
 * `compiledVertexSource`/`fullscreenByNode` are written *before*
 * `createProgram` runs (`compile.ts`), so a node whose fragment failed to
 * compile or whose program failed to link still gets a contract computed
 * here — which is exactly the case a `missing-out`/`type-mismatch` warning is
 * most useful for (a real varying mismatch is a common cause of a link
 * failure).
 */
export function buildVaryingContracts(
  plan: ExecutionPlan,
  graph: Graph,
): Record<string, NodeVaryings> {
  const out: Record<string, NodeVaryings> = {};
  for (const node of graph.nodes) {
    if (node.kind !== "shader") continue;
    const vert = plan.compiledVertexSource[node.id];
    if (vert === undefined) continue;
    const fragmentSource = (node as ShaderGraphNode).fragmentSource;
    out[node.id] = computeVaryingContract(vert, fragmentSource);
  }
  return out;
}
