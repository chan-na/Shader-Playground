import type { StateCreator } from "zustand";
import {
  allDescendants,
  getAbsolutePosition,
  orderParentsBeforeChildren,
  relativePositionFor,
  wouldCreateParentCycle,
} from "../core/graph/parents";
import type { GroupGraphNode } from "../core/graph/types";
import {
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  GROUP_SELECTION_PADDING,
} from "../core/graph/types";
import { nextId } from "../utils/id";
import { pushHistory } from "./graphStoreHelpers";
import type { GraphState } from "./graphStoreTypes";
import type { NodePosition } from "./types";

type GroupsSlice = Pick<
  GraphState,
  | "addGroup"
  | "setParent"
  | "groupSelected"
  | "removeGroup"
  | "setGroupLabel"
  | "setGroupColor"
  | "setGroupSize"
  | "toggleGroupCollapsed"
>;

/**
 * Group nodes (Phase 29/30): creating, wrapping a selection, reparenting,
 * removing and the label/color/size/collapse setters. Positions are
 * parent-relative, so every reparent converts through absolute coordinates.
 */
export const createGroupsSlice: StateCreator<
  GraphState,
  [],
  [],
  GroupsSlice
> = (set, get) => ({
  addGroup: (label, absolutePosition, size, options) => {
    const id = nextId("group");
    const parentId = options?.parentId;
    const width = Math.max(GROUP_MIN_WIDTH, size.width);
    const height = Math.max(GROUP_MIN_HEIGHT, size.height);
    const node: GroupGraphNode = {
      id,
      kind: "group",
      label,
      width,
      height,
      ...(options?.color !== undefined && { color: options.color }),
    };
    pushHistory(get());
    set((s) => {
      const relative = relativePositionFor(
        absolutePosition,
        parentId,
        s.positions,
        s.parents,
      );
      const positions = { ...s.positions, [id]: relative };
      const parents = { ...s.parents };
      if (parentId !== undefined) parents[id] = parentId;
      return {
        // React Flow requires group/parent nodes to appear BEFORE their
        // children in the `nodes` array. New empty group goes to the front so
        // any future child reparenting is order-safe.
        nodes: [node, ...s.nodes],
        positions,
        parents,
        rev: s.rev + 1,
      };
    });
    return id;
  },
  setParent: (id, newParentId) => {
    const s = get();
    const target = s.nodes.find((n) => n.id === id);
    if (!target) return false;
    if (wouldCreateParentCycle(s.parents, id, newParentId)) return false;
    const currentParent = s.parents[id];
    if (currentParent === newParentId) return false; // no-op
    const abs = getAbsolutePosition(id, s.positions, s.parents);
    const nextRelative = relativePositionFor(
      abs,
      newParentId,
      s.positions,
      s.parents,
    );
    pushHistory(s);
    set((cur) => {
      const parents = { ...cur.parents };
      if (newParentId === undefined) delete parents[id];
      else parents[id] = newParentId;
      const positions = { ...cur.positions, [id]: nextRelative };
      // React Flow requires parent nodes to precede children in the array.
      // Move `id` after its new parent (if any) so child ordering is valid.
      let nodes = cur.nodes;
      if (newParentId !== undefined) {
        const child = nodes.find((n) => n.id === id);
        const filtered = nodes.filter((n) => n.id !== id);
        const parentIdx = filtered.findIndex((n) => n.id === newParentId);
        if (child && parentIdx >= 0) {
          nodes = [
            ...filtered.slice(0, parentIdx + 1),
            child,
            ...filtered.slice(parentIdx + 1),
          ];
        }
        // Splicing `id` in behind its new parent can push it behind its OWN
        // descendants (they kept their old slots). Re-run the full ordering
        // over the freshly computed map so every level of the tree is valid,
        // not just the one link that moved. Releasing to top-level can't break
        // ordering, so that path keeps `cur.nodes` as-is.
        nodes = orderParentsBeforeChildren(nodes, parents);
      }
      return {
        nodes,
        parents,
        positions,
        rev: cur.rev + 1,
      };
    });
    return true;
  },
  groupSelected: (ids) => {
    const s = get();
    const valid = ids.filter((id) => s.nodes.some((n) => n.id === id));
    if (valid.length < 1) return null;

    // Pick the common parent of the selection (or null if mixed).
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const firstParent = s.parents[valid[0]!];
    const commonParent = valid.every((id) => s.parents[id] === firstParent)
      ? firstParent
      : undefined;

    // Compute absolute bounding box of the selection. Node card sizes vary,
    // so use a generous default span when the actual DOM size is unknown.
    // The group's width/height are sized to wrap the selection plus padding.
    const ABS_CARD_W = 200;
    const ABS_CARD_H = 120;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of valid) {
      const abs = getAbsolutePosition(id, s.positions, s.parents);
      // Group nodes carry explicit size; everyone else uses a typical span.
      const node = s.nodes.find((n) => n.id === id);
      const w =
        node && node.kind === "group"
          ? (node as GroupGraphNode).width
          : ABS_CARD_W;
      const h =
        node && node.kind === "group"
          ? (node as GroupGraphNode).height
          : ABS_CARD_H;
      if (abs.x < minX) minX = abs.x;
      if (abs.y < minY) minY = abs.y;
      if (abs.x + w > maxX) maxX = abs.x + w;
      if (abs.y + h > maxY) maxY = abs.y + h;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    const pad = GROUP_SELECTION_PADDING;
    // Group header eats some vertical space; leave extra padding on top so
    // labels never overlap the topmost child.
    const HEADER_OFFSET = 16;
    const groupAbsPos: NodePosition = {
      x: minX - pad,
      y: minY - pad - HEADER_OFFSET,
    };
    const groupWidth = Math.max(GROUP_MIN_WIDTH, maxX - minX + pad * 2);
    const groupHeight = Math.max(
      GROUP_MIN_HEIGHT,
      maxY - minY + pad * 2 + HEADER_OFFSET,
    );

    const groupId = nextId("group");
    const groupNode: GroupGraphNode = {
      id: groupId,
      kind: "group",
      label: "Group",
      width: groupWidth,
      height: groupHeight,
    };

    pushHistory(s);
    set((cur) => {
      const positions = { ...cur.positions };
      const parents = { ...cur.parents };
      // 1) Place the group at its absolute position, converted to its own
      // parent-relative frame.
      positions[groupId] = relativePositionFor(
        groupAbsPos,
        commonParent,
        cur.positions,
        cur.parents,
      );
      if (commonParent !== undefined) parents[groupId] = commonParent;

      // 2) Reparent each selected node under the new group. Its new relative
      // position is its current absolute minus the group's absolute.
      for (const id of valid) {
        const abs = getAbsolutePosition(id, cur.positions, cur.parents);
        positions[id] = {
          x: abs.x - groupAbsPos.x,
          y: abs.y - groupAbsPos.y,
        };
        parents[id] = groupId;
      }

      // 3) Order: group node MUST precede its children in `nodes` for RF.
      // Hoisting the selection to the back is not enough on its own — when a
      // selected node is itself a group, its unselected descendants stay in
      // `restNoSelection` and would then sit *before* their parent. Re-run the
      // full ordering over the freshly computed map to fix every level.
      const selectedSet = new Set(valid);
      const restNoSelection = cur.nodes.filter((n) => !selectedSet.has(n.id));
      const selectionInOrder = cur.nodes.filter((n) => selectedSet.has(n.id));
      const nodes = orderParentsBeforeChildren(
        [...restNoSelection, groupNode, ...selectionInOrder],
        parents,
      );

      return { nodes, positions, parents, rev: cur.rev + 1 };
    });
    return groupId;
  },
  removeGroup: (id, mode) => {
    const s = get();
    const target = s.nodes.find((n) => n.id === id);
    if (!target || target.kind !== "group") return;

    pushHistory(s);
    if (mode === "delete-children") {
      const descendants = allDescendants(id, s.nodes, s.parents);
      const removeIds = new Set<string>(descendants.map((n) => n.id));
      removeIds.add(id);
      set((cur) => {
        const positions = { ...cur.positions };
        const parents = { ...cur.parents };
        for (const rid of removeIds) {
          delete positions[rid];
          delete parents[rid];
        }
        return {
          nodes: cur.nodes.filter((n) => !removeIds.has(n.id)),
          edges: cur.edges.filter(
            (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
          ),
          positions,
          parents,
          rev: cur.rev + 1,
        };
      });
      return;
    }

    // release-children: promote direct children to the group's own parent
    // (or top-level) while preserving absolute positions.
    const grandparent = s.parents[id];
    set((cur) => {
      const positions = { ...cur.positions };
      const parents = { ...cur.parents };
      for (const child of cur.nodes) {
        if (parents[child.id] !== id) continue;
        const abs = getAbsolutePosition(child.id, cur.positions, cur.parents);
        positions[child.id] = relativePositionFor(
          abs,
          grandparent,
          cur.positions,
          cur.parents,
        );
        if (grandparent !== undefined) parents[child.id] = grandparent;
        else delete parents[child.id];
      }
      delete positions[id];
      delete parents[id];
      return {
        nodes: cur.nodes.filter((n) => n.id !== id),
        edges: cur.edges,
        positions,
        parents,
        rev: cur.rev + 1,
      };
    });
  },
  setGroupLabel: (id, label) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "group") return n;
        return { ...(n as GroupGraphNode), label };
      }),
      rev: s.rev + 1,
    }));
  },
  setGroupColor: (id, color) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "group") return n;
        const next: GroupGraphNode = {
          id: n.id,
          kind: "group",
          label: (n as GroupGraphNode).label,
          width: (n as GroupGraphNode).width,
          height: (n as GroupGraphNode).height,
        };
        if (color !== undefined) next.color = color;
        return next;
      }),
      rev: s.rev + 1,
    }));
  },
  toggleGroupCollapsed: (id) => {
    const target = get().nodes.find((n) => n.id === id);
    if (!target || target.kind !== "group") return;
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "group") return n;
        const gn = n as GroupGraphNode;
        return { ...gn, collapsed: !gn.collapsed };
      }),
      rev: s.rev + 1,
    }));
  },
  setGroupSize: (id, size) =>
    // Resize is visual-only and high-frequency (drag handle); treat like
    // position updates and skip history/rev to keep undo coherent.
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "group") return n;
        const gn = n as GroupGraphNode;
        return {
          ...gn,
          width: Math.max(GROUP_MIN_WIDTH, size.width),
          height: Math.max(GROUP_MIN_HEIGHT, size.height),
        };
      }),
    })),
});
