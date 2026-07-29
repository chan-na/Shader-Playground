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
 * Module-local: `addedPanDecision` is the one entry point the editor calls, so
 * that the decision it makes and the decision the tests make are the same code.
 */
function offscreenPanTarget(
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
 * this commit did to the node set.
 *
 * The decision itself is deferred one frame (a card that mounted this commit
 * has no size yet), and the effect that arms that frame is torn down by *any*
 * later commit touching the node array. Consuming the added ids where they are
 * computed would therefore lose them whenever a second commit lands inside the
 * same frame: the cancelled frame never decided, and the next run sees no
 * additions because the set difference was already spent. So a commit that
 * added nothing carries the previous list forward instead of clearing it.
 *
 * A commit that *did* add something replaces the list rather than growing it.
 * Pending ids are held until they can actually be judged (a 0×0 dock panel or a
 * card inside a collapsed group has no box to judge — see `addedPanDecision`),
 * and an unbounded list of those would drag long-forgotten nodes into the union
 * box of a much later add, framing a stale id instead of the one the user just
 * created. Dropping them at the moment a newer add arrives keeps the list
 * finite without an expiry timer, and matches where the user is looking: at
 * what they added last.
 *
 * Ids that disappeared again before the decision are dropped either way:
 * panning to a node that no longer renders would park the canvas on an empty
 * point.
 *
 * ## Constraint this trades on — check it before adding a new add path
 *
 * Replacing rather than unioning means that when two nodes are added while the
 * graph panel is collapsed, expanding it frames only the newer one. That is
 * harmless *only* because every add path in the app drops at a fixed flow
 * coordinate within a few hundred units of the origin (`AddNodePill.tsx`
 * -200/0, -200/200, 100/0, 400/0, and the same set in `CommandPalette`), so
 * framing the newest brings the older one into view with it — measured, not
 * assumed. An add path that can place nodes thousands of flow units apart
 * (paste-at-cursor, scripted or plugin adds) breaks that and would silently
 * strand the older node off-screen, which is the whole failure this module
 * exists to prevent. If such a path is added, switch back to a union here and
 * bound it another way (drop ids older than the newest commit, or expire by
 * commit count) instead of discarding the undecided id.
 */
export function pendingAddedIds(
  pending: readonly string[],
  prevIds: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): string[] {
  const added: string[] = [];
  for (const id of ids) {
    if (!prevIds.has(id)) added.push(id);
  }
  if (added.length > 0) return added;
  return pending.filter((id) => ids.has(id));
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
function addedCardSize(
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

/** Everything the pan decision needs to know about one just-added node, read
 *  out of React Flow (and the card's element) by the caller. `null` when React
 *  Flow has no internal node under that id — it has not processed the add yet. */
export type AddedNodeProbe = {
  /** Descendant of a collapsed group: React Flow renders it nowhere at all. */
  hidden: boolean;
  /** The card's top-left in absolute flow coordinates. */
  position: { x: number; y: number };
  /** React Flow's own measurement — empty until its ResizeObserver has run. */
  measured: { width?: number | undefined; height?: number | undefined };
  /** The mounted element's layout box, or `null` when there is no element. */
  dom: { width: number; height: number } | null;
};

/**
 * The whole one-frame pan decision: given the visible area and the ids that
 * still owe an answer, where the canvas has to be centered (or `null` to leave
 * it alone) *and* which ids remain undecided.
 *
 * The split between "decided" and "still pending" is the point of returning
 * both. An id can only be judged against a real box, and two cases have none:
 *
 *  • `probe` returns `null` — React Flow has not taken the node yet.
 *  • `hidden` — the node is inside a collapsed group, so it renders nowhere;
 *    panning to it would park the canvas on a point with nothing on it.
 *
 * Neither is an answer of "no pan needed", so neither consumes the id: it stays
 * pending for the next run (expanding the group re-writes the node array, which
 * re-arms the decision). Treating "cannot judge" as "judged no" is what silently
 * dropped adds made under a collapsed dock panel.
 */
export function addedPanDecision(
  view: FlowRect,
  addedIds: readonly string[],
  probe: (id: string) => AddedNodeProbe | null,
  fallback: { width: number; height: number },
): { target: { x: number; y: number } | null; pending: string[] } {
  const boxes: FlowRect[] = [];
  const pending: string[] = [];
  for (const id of addedIds) {
    const p = probe(id);
    if (p === null || p.hidden) {
      pending.push(id);
      continue;
    }
    const size = addedCardSize(p.measured, p.dom, fallback);
    boxes.push({
      x: p.position.x,
      y: p.position.y,
      width: size.width,
      height: size.height,
    });
  }
  return { target: offscreenPanTarget(view, boxes), pending };
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
