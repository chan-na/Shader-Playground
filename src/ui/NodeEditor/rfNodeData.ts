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
 * The added-node ids that still owe a pan decision, after folding in whatever
 * this commit added and dropping whatever it took away.
 *
 * The decision itself is deferred one frame (a card that mounted this commit
 * has no size yet), and the effect that arms that frame is torn down by *any*
 * later commit touching the node array. Consuming the added ids where they are
 * computed would therefore lose them whenever a second commit lands inside the
 * same frame: the cancelled frame never decided, and the next run sees no
 * additions because the set difference was already spent. Carrying them
 * forward until the frame actually fires is what keeps that case working —
 * which is why this returns the *whole* pending list, not just this commit's
 * additions.
 *
 * Ids that disappeared again before the decision are dropped: panning to a node
 * that no longer renders would park the canvas on an empty point.
 */
export function pendingAddedIds(
  pending: readonly string[],
  prevIds: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): string[] {
  const next: string[] = [];
  for (const id of pending) {
    if (ids.has(id)) next.push(id);
  }
  for (const id of ids) {
    if (!prevIds.has(id) && !next.includes(id)) next.push(id);
  }
  return next;
}

/**
 * The flow-space size of a just-added node card, from the most trustworthy
 * source that has an answer yet.
 *
 * React Flow only ever learns a card's size from a ResizeObserver, and the
 * browser delivers those callbacks *after* the frame's requestAnimationFrame
 * callbacks — so on the frame right after a card mounts, which is exactly the
 * frame the pan decision runs on, `measured` is still empty. Falling straight
 * through to a stand-in size makes that decision against a box that is not the
 * card: a real Image card is about 148×162 against a 180×64 stand-in, so a card
 * with 60px of itself on screen reads as fully off-screen and the canvas pans
 * away from something the user can already see.
 *
 * The mounted element is the very source React Flow measures (`offsetWidth`/
 * `offsetHeight` — layout px, unaffected by the viewport's zoom transform, so
 * already flow units) and it is correct from the first frame. The stand-in
 * stays as the last resort, for a node with no element at all.
 */
export function addedCardSize(
  measured: { width?: number | undefined; height?: number | undefined },
  dom: { width: number; height: number } | null,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const { width, height } = measured;
  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    return { width, height };
  }
  if (dom !== null && dom.width > 0 && dom.height > 0) return dom;
  return fallback;
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
