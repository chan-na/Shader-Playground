import type { GraphNode } from "../../core/graph/types";

/** The `data` payload React Flow hands to each node-card view (`data.node`).
 *  A `type` alias (not an `interface`) so it satisfies React Flow's
 *  `Record<string, unknown>` data constraint via the implicit index signature. */
export type NodeCardData = {
  node: GraphNode;
};

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
