import type { PortSpec } from "../nodes/registry";
import { nodeInputPorts, nodeOutputPorts } from "../nodes/registry";
import type { GraphEdge, GraphNode } from "./types";

/** An input port that kept its slot and type but changed name. */
export interface PortRename {
  from: string;
  to: string;
}

/**
 * Drop the edges that reference ports `node` no longer exposes.
 *
 * A node's port surface is derived from its editable state — a ShaderNode's
 * inputs come from its GLSL uniforms, a ComputeNode's from its vertex source,
 * Math's from its op, Combine's from its arity. Deleting a `uniform`, renaming
 * it, or switching an op therefore retires a port that edges may still point
 * at, and nothing else in the graph notices: `validateGraph` only checks node
 * ids, and `compileGraph` binds `e.targetHandle` as a uniform name without
 * asking whether that uniform exists.
 *
 * Such an edge is invisible but not inert. `execute` skips the unknown uniform
 * location, yet compile still counted the edge — a stale sampler edge consumes
 * a texture unit and keeps its upstream pass in the plan (rendering an FBO
 * nobody samples), and every stale edge remains a real dependency for
 * topological order and cycle detection, so the graph can refuse a legitimate
 * reverse connection because of a link the user can no longer see.
 *
 * Returns `edges` unchanged (same reference) when nothing is dropped, so store
 * subscribers keyed on edge identity don't re-render for a no-op edit.
 */
export function pruneEdgesForNode(
  node: GraphNode,
  edges: GraphEdge[],
): GraphEdge[] {
  const inputs = new Set(nodeInputPorts(node).map((p) => p.name));
  const outputs = new Set(nodeOutputPorts(node).map((p) => p.name));
  const kept = edges.filter((e) => {
    if (e.target === node.id && !inputs.has(e.targetHandle)) return false;
    if (e.source === node.id && !outputs.has(e.sourceHandle)) return false;
    return true;
  });
  return kept.length === edges.length ? edges : kept;
}

/**
 * Decide whether `prev` → `next` renamed one input port, so the caller can
 * carry that port's edge and tuned value across instead of letting
 * {@link pruneEdgesForNode} drop them.
 *
 * A rename reads to the port surface exactly like "delete one uniform, add
 * another": there is no rename event to observe, only two port lists. Two
 * paths resolve that ambiguity.
 *
 * **With a `hint`** — the F2 rename refactor knows the pair for certain, so it
 * passes it in. The hint is still validated against the surface (old name gone,
 * new name present, same type): renaming a local, a varying or a function
 * touches no port, and an unvalidated hint would then drag an unrelated edge
 * that happens to share the old name.
 *
 * **Without one** — hand typing commits through the 50ms editor debounce, which
 * reports only the finished source. We infer a rename when the surface kept its
 * length and exactly one slot changed name while keeping its index and type.
 * A single edit that deletes one uniform and adds another of the same type in
 * the same declaration slot is indistinguishable from a rename and will move
 * the edge — an accepted trade for making hand-typed renames keep their wiring
 * (the alternative, dropping it, is the pre-existing behaviour either way).
 */
function resolvePortRename(
  prev: GraphNode | undefined,
  next: GraphNode,
  hint: PortRename | undefined,
): PortRename | null {
  if (!prev || prev.id !== next.id) return null;
  const before = nodeInputPorts(prev);
  const after = nodeInputPorts(next);
  if (hint) return validatedHint(hint, before, after);

  let found: PortRename | null = null;
  if (before.length !== after.length) return null;
  for (let i = 0; i < before.length; i++) {
    const b = before[i];
    const a = after[i];
    if (!b || !a) return null;
    if (b.name === a.name) continue;
    // A slot that changed type isn't a rename, and a second moved slot means
    // the edit reshaped the surface (a reorder, a swap, a paste) — bail rather
    // than guess which pairing was meant.
    if (b.type !== a.type || found) return null;
    found = { from: b.name, to: a.name };
  }
  if (!found) return null;
  const rename = found;
  if (after.some((p) => p.name === rename.from)) return null;
  if (before.some((p) => p.name === rename.to)) return null;
  return rename;
}

function validatedHint(
  hint: PortRename,
  before: PortSpec[],
  after: PortSpec[],
): PortRename | null {
  if (hint.from === hint.to) return null;
  const old = before.find((p) => p.name === hint.from);
  const fresh = after.find((p) => p.name === hint.to);
  if (!old || !fresh || old.type !== fresh.type) return null;
  if (after.some((p) => p.name === hint.from)) return null;
  return hint;
}

/**
 * Move `next`'s edges off a renamed input port and onto its new name.
 *
 * Returns the resolved rename as well so the caller can migrate the state it
 * keys by port name — a shader/compute node's `uniformValues`, which would
 * otherwise strand the tuned value under the old key and reset the Inspector
 * to the declaration default. Returns `edges` unchanged (same reference) when
 * nothing moved, and a non-null `rename` even then, since the value migration
 * is still due for a renamed port that had no edge.
 */
export function applyPortRename(
  prev: GraphNode | undefined,
  next: GraphNode,
  edges: GraphEdge[],
  hint?: PortRename,
): { edges: GraphEdge[]; rename: PortRename | null } {
  const rename = resolvePortRename(prev, next, hint);
  if (!rename) return { edges, rename: null };
  let moved = false;
  const remapped = edges.map((e) => {
    if (e.target !== next.id || e.targetHandle !== rename.from) return e;
    moved = true;
    return { ...e, targetHandle: rename.to };
  });
  return { edges: moved ? remapped : edges, rename };
}

/**
 * Whole-graph sweep of {@link pruneEdgesForNode}, for the load path.
 *
 * Projects saved before ports were reconciled on edit (autosave, share URLs,
 * exported JSON) can carry edges into ports that no longer exist, and nothing
 * cleans them until the owning node's source is edited again. Returns the
 * survivors plus what was dropped so the caller can warn per edge.
 *
 * Edges whose node is missing entirely are left alone: `validateGraph` reports
 * those as `missing_node`, and warning-without-dropping is that class's
 * existing contract on load.
 */
export function pruneDeadEdges(
  nodes: GraphNode[],
  edges: GraphEdge[],
): {
  edges: GraphEdge[];
  dropped: Array<{ edge: GraphEdge; nodeId: string; handle: string }>;
} {
  const surface = new Map<
    string,
    { inputs: Set<string>; outputs: Set<string> }
  >();
  for (const n of nodes) {
    surface.set(n.id, {
      inputs: new Set(nodeInputPorts(n).map((p) => p.name)),
      outputs: new Set(nodeOutputPorts(n).map((p) => p.name)),
    });
  }
  const dropped: Array<{ edge: GraphEdge; nodeId: string; handle: string }> =
    [];
  const kept = edges.filter((e) => {
    const target = surface.get(e.target);
    if (target && !target.inputs.has(e.targetHandle)) {
      dropped.push({ edge: e, nodeId: e.target, handle: e.targetHandle });
      return false;
    }
    const source = surface.get(e.source);
    if (source && !source.outputs.has(e.sourceHandle)) {
      dropped.push({ edge: e, nodeId: e.source, handle: e.sourceHandle });
      return false;
    }
    return true;
  });
  return { edges: dropped.length === 0 ? edges : kept, dropped };
}
