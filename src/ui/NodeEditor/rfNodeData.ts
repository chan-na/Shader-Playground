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

/** An axis-aligned box in flow (graph) coordinates. */
export type FlowRect = { x: number; y: number; width: number; height: number };

/** Does `r` share any area with `view`? Touching edges don't count. */
function overlaps(view: FlowRect, r: FlowRect): boolean {
  return (
    r.x < view.x + view.width &&
    r.x + r.width > view.x &&
    r.y < view.y + view.height &&
    r.y + r.height > view.y
  );
}

/**
 * Where the canvas has to be centered so that just-added nodes are on screen —
 * or `null` when the viewport must be left exactly as the user left it.
 *
 * Every add path (AddNodePill, CommandPalette) drops its node at a fixed flow
 * coordinate near the origin. While the editor refit itself after every
 * structural edit that was invisible; since [#38] restricted the refit to
 * wholesale replacements, adding a node after panning away lands it outside
 * the viewport with no feedback at all. This is the visibility half of that
 * fix: the *caller* pans (never zooms — re-framing is precisely what #38
 * removed), and only when there is nothing to see otherwise.
 *
 * Lives here rather than inline in index.tsx so it is unit-testable, the same
 * reason `groupBoxHeight` was extracted.
 */
export function offscreenPanTarget(
  view: FlowRect,
  added: readonly FlowRect[],
): { x: number; y: number } | null {
  const first = added[0];
  if (first === undefined) return null;
  // A node even partially on screen is feedback enough — the user can see
  // that *something* appeared, and moving the canvas out from under them then
  // would be the intrusive choice.
  for (const r of added) {
    if (overlaps(view, r)) return null;
  }
  // Batch add (paste, an import dropping several nodes): center the union so
  // the whole batch lands in view at the current zoom. If the batch is wider
  // or taller than the viewport, its union center is the empty middle of the
  // spread — frame the first added node instead, since one node definitely
  // visible beats a centered void. (Zooming out to fit is not an option here.)
  let x1 = first.x;
  let y1 = first.y;
  let x2 = first.x + first.width;
  let y2 = first.y + first.height;
  for (const r of added) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  if (x2 - x1 > view.width || y2 - y1 > view.height) {
    return { x: first.x + first.width / 2, y: first.y + first.height / 2 };
  }
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
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
