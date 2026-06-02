import type { NodePosition } from "../../state/types";
import type { GraphNode } from "./types";

/**
 * Parent-child map for grouping. `parents[childId] === groupId` means the
 * child belongs to that group. Top-level nodes have no entry. The relationship
 * lives alongside positions in graphStore — never inside the node objects —
 * so adding/removing the group has no effect on the render path.
 */
export type ParentsMap = Record<string, string>;

/** Add `{ x, y }` componentwise. */
function addPos(a: NodePosition, b: NodePosition): NodePosition {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Subtract `{ x, y }` componentwise. */
function subPos(a: NodePosition, b: NodePosition): NodePosition {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Walk the parent chain to recover the absolute position of `id` from the
 * (parent-relative) positions stored in the graph. Returns `{x:0,y:0}` when
 * `id` has no recorded position. Self-cycles in `parents` are defensive-bailed
 * after a fixed depth — the store never persists such a state, but this keeps
 * the helper robust to malformed inputs (e.g. corrupted share URLs).
 */
export function getAbsolutePosition(
  id: string,
  positions: Record<string, NodePosition>,
  parents: ParentsMap,
): NodePosition {
  const MAX_DEPTH = 64;
  let cur: string | undefined = id;
  let acc: NodePosition = { x: 0, y: 0 };
  for (let i = 0; i < MAX_DEPTH && cur !== undefined; i++) {
    const p = positions[cur];
    if (p) acc = addPos(acc, p);
    cur = parents[cur];
  }
  return acc;
}

/**
 * Check whether assigning `parents[childId] = newParentId` would create a
 * cycle through the parent chain (e.g. child A whose new parent is B, where
 * B is already a descendant of A). Self-parenting also counts as a cycle.
 *
 * `newParentId === undefined` (release to top-level) cannot create a cycle.
 */
export function wouldCreateParentCycle(
  parents: ParentsMap,
  childId: string,
  newParentId: string | undefined,
): boolean {
  if (newParentId === undefined) return false;
  if (newParentId === childId) return true;
  const MAX_DEPTH = 64;
  let cur: string | undefined = newParentId;
  for (let i = 0; i < MAX_DEPTH && cur !== undefined; i++) {
    if (cur === childId) return true;
    cur = parents[cur];
  }
  return false;
}

/**
 * Return the depth of `id` in the parent tree (top-level = 0). Defensive
 * against cycles via the same fixed-depth cap as `getAbsolutePosition`.
 */
export function parentDepth(id: string, parents: ParentsMap): number {
  const MAX_DEPTH = 64;
  let cur: string | undefined = parents[id];
  let depth = 0;
  while (cur !== undefined && depth < MAX_DEPTH) {
    depth++;
    cur = parents[cur];
  }
  return depth;
}

/**
 * Direct children of `parentId` (one level deep). The ordering matches
 * `nodes` iteration order so callers get a deterministic result.
 */
export function directChildren(
  parentId: string,
  nodes: ReadonlyArray<GraphNode>,
  parents: ParentsMap,
): GraphNode[] {
  return nodes.filter((n) => parents[n.id] === parentId);
}

/**
 * All descendants of `parentId` (transitive). Used for cascade delete and
 * ancestor-cycle checks. Order is undefined.
 */
export function allDescendants(
  parentId: string,
  nodes: ReadonlyArray<GraphNode>,
  parents: ParentsMap,
): GraphNode[] {
  const out: GraphNode[] = [];
  const stack = [parentId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined) break;
    for (const n of nodes) {
      if (visited.has(n.id)) continue;
      if (parents[n.id] === cur) {
        visited.add(n.id);
        out.push(n);
        stack.push(n.id);
      }
    }
  }
  return out;
}

/**
 * Reorder `nodes` so that every parent appears before all its descendants —
 * React Flow's nesting model requires this. The original order is preserved
 * between unrelated siblings (stable insertion sort over the parent chain).
 * Returns a new array; the input is not mutated.
 */
export function orderParentsBeforeChildren(
  nodes: ReadonlyArray<GraphNode>,
  parents: ParentsMap,
): GraphNode[] {
  const byId = new Map<string, GraphNode>();
  for (const n of nodes) byId.set(n.id, n);
  const visited = new Set<string>();
  const out: GraphNode[] = [];
  const visit = (id: string, stack: Set<string>): void => {
    if (visited.has(id) || stack.has(id)) return;
    const parent = parents[id];
    if (parent !== undefined && byId.has(parent)) {
      stack.add(id);
      visit(parent, stack);
      stack.delete(id);
    }
    const n = byId.get(id);
    if (n) out.push(n);
    visited.add(id);
  };
  for (const n of nodes) visit(n.id, new Set());
  return out;
}

/**
 * True when any ancestor of `id` in the parent chain is a collapsed group.
 * Used by the editor to hide descendants of a collapsed group. The node's own
 * id is never considered (a collapsed group still renders its own header).
 * Defensive against cycles via the same fixed-depth cap as the other walkers.
 */
export function hasCollapsedAncestor(
  id: string,
  parents: ParentsMap,
  collapsedGroupIds: ReadonlySet<string>,
): boolean {
  const MAX_DEPTH = 64;
  let cur: string | undefined = parents[id];
  for (let i = 0; i < MAX_DEPTH && cur !== undefined; i++) {
    if (collapsedGroupIds.has(cur)) return true;
    cur = parents[cur];
  }
  return false;
}

/**
 * Compute the parent-relative position needed for `id` to end up at
 * `targetAbsolute` once it lives under `newParentId`. When `newParentId` is
 * undefined (top-level), the result is just `targetAbsolute`.
 */
export function relativePositionFor(
  targetAbsolute: NodePosition,
  newParentId: string | undefined,
  positions: Record<string, NodePosition>,
  parents: ParentsMap,
): NodePosition {
  if (newParentId === undefined) return targetAbsolute;
  const parentAbs = getAbsolutePosition(newParentId, positions, parents);
  return subPos(targetAbsolute, parentAbs);
}
