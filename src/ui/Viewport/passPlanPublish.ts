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
 *  - "fullscreen quad" — the auto-substituted fullscreen pass.
 *  - "" — compute-driven; the caller renders the driving ComputeNode's own
 *    row instead of a mesh label here.
 *  - the built-in primitive name, or the loaded asset's display name.
 *
 * The asset branch mirrors `compile.ts`'s `meshDataFor` fallback rather than
 * the node's *intent*: an `assetId` whose handle isn't in the catalog (import
 * still in flight, asset dropped from a restored session) falls through to
 * `makePrimitive(mn.primitive)` there, so the pass genuinely draws the
 * primitive. Naming the asset anyway put the Pass Inspector — the one surface
 * whose whole premise is "what actually runs this frame" — at odds with both
 * the node card (`meshContractFor` reports `source: "primitive"` in exactly
 * this state) and the draw call itself.
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
  if (mn.assetId) {
    const handle = assets.meshes[mn.assetId];
    if (handle) return handle.name;
    return `${mn.primitive} (asset not loaded)`;
  }
  return mn.primitive;
}

/**
 * Source-node kinds that hand `bindSamplers` a texture even when the plan
 * itself carries none for them:
 *  - shader/compute — a source that failed to compile has no entry in
 *    `shaderPassByNode`, but `execute.ts` binds its opaque-black placeholder
 *    (`ensureBlankTexture`) rather than skipping the unit.
 *  - webcam/video/audio — external sources live outside the plan (they
 *    survive recompiles) and their texture appears/disappears per frame, so
 *    no compile-time verdict is possible. Treated as resolved: claiming
 *    "unbound" for the frame or two before the first upload would be a false
 *    alarm on every working webcam graph.
 */
const SELF_TEXTURING_KINDS: ReadonlySet<string> = new Set([
  "shader",
  "compute",
  "webcam",
  "video",
  "audio",
]);

/**
 * Sampler uniform names whose edge exists but whose source produces no
 * texture at all — an ImageNode with no `assetId`, or one whose asset never
 * made it into `plan.imageTextures` (catalog miss on a restored session,
 * bitmap not decoded, `createImageTexture` threw). `execute.ts`'s
 * `bindSamplers` `continue`s over exactly these, so no `uniform1i` and no
 * `bindTexture` happens for them and the sampler keeps its link-time default
 * of unit 0.
 *
 * This is the samplers-column counterpart to `meshLabelFor`'s
 * "(asset not loaded)" fallback above: the Pass Inspector's whole premise is
 * "what actually runs this frame", so an edge alone must not be reported as a
 * binding. Mirrors the `bindSamplers` lookup order exactly (pass → plan image
 * → external), which is why an absent source node counts as unresolved —
 * `execute.ts` skips that unit too.
 */
function emptySourceSamplers(
  plan: ExecutionPlan,
  graph: Graph,
  samplers: ReadonlyArray<{ uniformName: string; sourceNodeId: string }>,
): Set<string> {
  const out = new Set<string>();
  for (const s of samplers) {
    if (plan.shaderPassByNode.has(s.sourceNodeId)) continue;
    if (plan.imageTextures[s.sourceNodeId] !== undefined) continue;
    const src = graph.nodes.find((n) => n.id === s.sourceNodeId);
    if (src && SELF_TEXTURING_KINDS.has(src.kind)) continue;
    out.add(s.uniformName);
  }
  return out;
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
 * is the one field genuinely computed here: it's a `parseUniforms`
 * pass plus a small set diff, cheap enough at recompile frequency (not a RAF
 * hot path — see `Viewport/index.tsx`'s `recompile`). `buildVaryingContracts`
 * below is the same story for the varying contract: one `computeVaryingContract` call per
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
    // Declared-uniform set for silent-warning diffing is read from the *compiled* vertex source
    // (plan.compiledVertexSource), not node.vertexSource — a fullscreen-
    // substituted node's user vertex declarations never reached the GL
    // compiler, so asserting against them would manufacture warning noise
    // (see `ExecutionPlan.compiledVertexSource`'s doc in compile.ts).
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
          emptySourceSamplers(plan, graph, pass.samplers),
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
 * Vertex↔fragment varying contract per shader node, for the Pass
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
