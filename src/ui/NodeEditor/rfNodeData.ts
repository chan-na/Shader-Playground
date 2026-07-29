import type { GraphNode, GroupGraphNode } from "../../core/graph/types";
import { GROUP_COLLAPSED_HEIGHT } from "../../core/graph/types";

/** The `data` payload React Flow hands to each node-card view (`data.node`).
 *  A `type` alias (not an `interface`) so it satisfies React Flow's
 *  `Record<string, unknown>` data constraint via the implicit index signature. */
export type NodeCardData = {
  node: GraphNode;
};

/**
 * The height a group node actually occupies on the canvas.
 *
 * A collapsed group draws only its header bar; `height` keeps the container
 * size it will return to when expanded. Every piece of drop-target geometry
 * has to agree on which of the two applies — the group's own hit-box *and*
 * the box of a group being dragged — or a collapsed group is measured 200px
 * tall while it looks 30px tall and lands in the wrong parent.
 */
export function groupBoxHeight(gn: GroupGraphNode): number {
  return gn.collapsed === true ? GROUP_COLLAPSED_HEIGHT : gn.height;
}

/**
 * Build a memoizer that returns a stable `{ node }` wrapper for a graph node.
 *
 * React Flow decides whether to re-render a node's card by the reference
 * identity of its `data` prop. The graph store keeps node objects
 * referentially stable across non-structural updates — a drag only rewrites
 * `positions` (never `nodes`), and every node mutator re-maps with
 * `n.id !== id ? n : { ...n }` so untouched nodes keep their reference. Keying
 * the wrapper on the node object therefore means only the node that actually
 * changed produces a new `data` reference; every other card skips re-render.
 *
 * Backed by a `WeakMap` so wrappers for replaced node objects are collected
 * automatically (no manual eviction, no unbounded growth).
 */
export function createNodeDataCache(): (node: GraphNode) => NodeCardData {
  const cache = new WeakMap<GraphNode, NodeCardData>();
  return (node) => {
    let data = cache.get(node);
    if (data === undefined) {
      data = { node };
      cache.set(node, data);
    }
    return data;
  };
}
