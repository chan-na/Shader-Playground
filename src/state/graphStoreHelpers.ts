import type { PortRename } from "../core/graph/edgePrune";
import { applyPortRename, pruneEdgesForNode } from "../core/graph/edgePrune";
import type { ParentsMap } from "../core/graph/parents";
import type {
  ComputeGraphNode,
  GraphEdge,
  GraphNode,
  ShaderGraphNode,
} from "../core/graph/types";
import type { GraphState } from "./graphStoreTypes";
import { useHistoryStore } from "./historyStore";
import type { NodePosition } from "./types";

/**
 * Nodes and edges after `id`'s port surface was re-derived. Every mutator that
 * can *retire* a port (a uniform deleted or renamed, Math switched to a unary
 * op, Combine's arity lowered) must route its next state through this, or the
 * graph keeps edges pointing at ports that no longer exist — see
 * core/graph/edgePrune for what those cost.
 *
 * A rename is handled before the prune: the edge follows the port to its new
 * name and the node's tuned value follows with it, so only genuinely retired
 * ports lose their wiring. Returns the same array references when nothing
 * changed, so store subscribers keyed on identity don't re-render for a no-op.
 */
export function reconciled(
  id: string,
  prevNodes: GraphNode[],
  nodes: GraphNode[],
  edges: GraphEdge[],
  rename?: PortRename,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const next = nodes.find((n) => n.id === id);
  if (!next) return { nodes, edges };
  const prev = prevNodes.find((n) => n.id === id);
  const moved = applyPortRename(prev, next, edges, rename);
  const applied = moved.rename;
  return {
    nodes: applied
      ? nodes.map((n) => (n.id === id ? withRenamedUniform(n, applied) : n))
      : nodes,
    edges: pruneEdgesForNode(next, moved.edges),
  };
}

/**
 * Move a uniform's tuned value to the port's new name. `uniformValues` is
 * keyed by uniform name, so without this a rename resets the Inspector to the
 * declaration default and leaves the old key to accumulate in every save.
 */
function withRenamedUniform(node: GraphNode, rename: PortRename): GraphNode {
  if (node.kind !== "shader" && node.kind !== "compute") return node;
  const owner = node as ShaderGraphNode | ComputeGraphNode;
  const value = owner.uniformValues[rename.from];
  if (value === undefined) return node;
  const uniformValues = { ...owner.uniformValues, [rename.to]: value };
  delete uniformValues[rename.from];
  return { ...owner, uniformValues };
}

/**
 * True when some ancestor of `id` is itself part of the moving selection and
 * carries a position of its own. Stored positions are parent-relative, so a
 * selection that contains both a group and something nested inside it must
 * translate the group only — the descendant is carried along by its parent and
 * would otherwise move twice (or 3× for a chain of nested groups). The walk is
 * transitive and capped like the other parent-chain walkers in
 * core/graph/parents, so a malformed cycle can't hang the nudge.
 */
export function hasSelectedPositionedAncestor(
  id: string,
  parents: ParentsMap,
  positions: Record<string, NodePosition>,
  selected: ReadonlySet<string>,
): boolean {
  const MAX_DEPTH = 64;
  let cur: string | undefined = parents[id];
  for (let i = 0; i < MAX_DEPTH && cur !== undefined; i++) {
    if (selected.has(cur) && positions[cur] !== undefined) return true;
    cur = parents[cur];
  }
  return false;
}

export function pushHistory(s: GraphState) {
  useHistoryStore.getState().push({
    nodes: s.nodes.map((n) => ({ ...n })),
    edges: s.edges.map((e) => ({ ...e })),
    positions: Object.fromEntries(
      Object.entries(s.positions).map(([k, v]) => [k, { x: v.x, y: v.y }]),
    ),
    parents: { ...s.parents },
  });
}
