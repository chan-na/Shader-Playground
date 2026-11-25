import { create } from "zustand";
import {
  getAbsolutePosition,
  orderParentsBeforeChildren,
} from "../core/graph/parents";
import type {
  ComputeGraphNode,
  Graph,
  GraphNode,
  ShaderGraphNode,
} from "../core/graph/types";
import { SANITIZE_LIMITS } from "../core/graph/types";
import { writeUniformHints } from "../core/graph/uniformParser";
import { nextId } from "../utils/id";
import { createGroupsSlice } from "./graphStoreGroups";
import {
  hasSelectedPositionedAncestor,
  pushHistory,
  reconciled,
} from "./graphStoreHelpers";
import { createNodeConfigSlice } from "./graphStoreNodeConfig";
import type { GraphState } from "./graphStoreTypes";
import { type GraphSnapshot, useHistoryStore } from "./historyStore";

// The store is composed from slices: core graph edits and shader/compute
// sources live here; group actions in graphStoreGroups, per-kind node config
// setters in graphStoreNodeConfig. `GraphState` (graphStoreTypes) is the
// single public shape.
export const useGraphStore = create<GraphState>((set, get, api) => ({
  nodes: [],
  edges: [],
  positions: {},
  parents: {},
  rev: 0,
  uniformRev: 0,
  graphEpoch: 0,
  setGraph: (g, positions, parents) => {
    pushHistory(get());
    set((s) => {
      const nextParents = parents ?? {};
      return {
        nodes: orderParentsBeforeChildren(g.nodes, nextParents),
        edges: g.edges,
        positions: positions ?? s.positions,
        parents: nextParents,
        rev: s.rev + 1,
        graphEpoch: s.graphEpoch + 1,
      };
    });
  },
  addNode: (node, position) => {
    pushHistory(get());
    set((s) => ({
      nodes: [...s.nodes, node],
      positions: position
        ? { ...s.positions, [node.id]: position }
        : s.positions,
      rev: s.rev + 1,
    }));
  },
  cloneNode: (id) => {
    const src = get().nodes.find((n) => n.id === id);
    if (!src) return null;
    const newId = nextId(src.kind);
    const clone: GraphNode = { ...structuredClone(src), id: newId };
    const srcPos = get().positions[id];
    // The clone inherits the source's group. Positions are parent-relative, so
    // without this the "+40" offset is read against the canvas origin instead
    // of the group's — the copy lands far away from its original and outside
    // the group box it visually belongs to.
    const srcParent = get().parents[id];
    pushHistory(get());
    set((s) => ({
      // Appending keeps any parent ahead of the clone, as React Flow requires.
      nodes: [...s.nodes, clone],
      positions: srcPos
        ? { ...s.positions, [newId]: { x: srcPos.x + 40, y: srcPos.y + 40 } }
        : s.positions,
      ...(srcParent !== undefined
        ? { parents: { ...s.parents, [newId]: srcParent } }
        : {}),
      rev: s.rev + 1,
    }));
    return newId;
  },
  removeNode: (id) => {
    pushHistory(get());
    set((s) => {
      const positions = { ...s.positions };
      const parents = { ...s.parents };
      // If the removed node is a parent, orphaned children need their
      // parent-relative positions promoted to absolute (their old position is
      // relative to a parent that's about to vanish). Compute absolute
      // positions BEFORE mutating positions/parents.
      const orphanedChildren: string[] = [];
      for (const child of Object.keys(parents)) {
        if (parents[child] === id) orphanedChildren.push(child);
      }
      for (const child of orphanedChildren) {
        const abs = getAbsolutePosition(child, s.positions, s.parents);
        positions[child] = abs;
        delete parents[child];
      }
      delete positions[id];
      delete parents[id];
      return {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        positions,
        parents,
        rev: s.rev + 1,
      };
    });
  },
  renameNode: (id, name) => {
    // Same cap the sanitizer re-applies when the project is reloaded, so a
    // name that survives here round-trips unchanged.
    const trimmed = name.trim().slice(0, SANITIZE_LIMITS.MAX_NODE_NAME_LEN);
    const target = get().nodes.find((n) => n.id === id);
    if (!target) return;
    // The Inspector shows one common Name field for every kind,
    // groups included. A group's title lives in `label` (its single source —
    // also what GroupNodeView's inline edit and serialization use), so route
    // there instead of giving the node a second, competing `name`. Blank is a
    // no-op rather than a clear: `label` is non-optional and every other
    // group-rename path already refuses to empty it.
    if (target.kind === "group") {
      if (trimmed === "" || trimmed === target.label) return;
      get().setGroupLabel(id, trimmed);
      return;
    }
    if (trimmed === (target.name ?? "")) return;
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n;
        if (trimmed !== "") return { ...n, name: trimmed };
        const { name: _name, ...rest } = n;
        return rest;
      }),
      rev: s.rev + 1,
    }));
  },
  updateNodePosition: (id, position) =>
    set((s) => ({ positions: { ...s.positions, [id]: position } })),
  nudgeNodes: (ids, dx, dy) =>
    set((s) => {
      if (ids.length === 0 || (dx === 0 && dy === 0)) return {};
      const selected = new Set(ids);
      const positions = { ...s.positions };
      let changed = false;
      for (const id of ids) {
        const p = positions[id];
        if (!p) continue;
        // A node whose (grand)parent is moving too is already carried by it.
        if (hasSelectedPositionedAncestor(id, s.parents, s.positions, selected))
          continue;
        positions[id] = { x: p.x + dx, y: p.y + dy };
        changed = true;
      }
      // Everything was carried by an ancestor: keep the previous identity so
      // subscribers keyed on `positions` don't re-render for a no-op.
      return changed ? { positions } : {};
    }),
  updateShaderSource: (id, patch, rename) => {
    pushHistory(get());
    set((s) => {
      const patched = s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "shader") return n;
        const sn = n as ShaderGraphNode;
        return {
          ...sn,
          vertexSource: patch.vertexSource ?? sn.vertexSource,
          fragmentSource: patch.fragmentSource ?? sn.fragmentSource,
        };
      });
      // Deleting a uniform retires its input port; renaming one moves it.
      const r = reconciled(id, s.nodes, patched, s.edges, rename);
      return { nodes: r.nodes, edges: r.edges, rev: s.rev + 1 };
    });
  },
  setUniformValue: (id, name, value) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n;
        if (n.kind === "shader") {
          const sn = n as ShaderGraphNode;
          return {
            ...sn,
            uniformValues: { ...sn.uniformValues, [name]: value },
          };
        }
        if (n.kind === "compute") {
          const cn = n as ComputeGraphNode;
          return {
            ...cn,
            uniformValues: { ...cn.uniformValues, [name]: value },
          };
        }
        return n;
      }),
      uniformRev: s.uniformRev + 1,
    })),
  setUniformHints: (id, name, hints) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    if (node.kind === "shader") {
      const sn = node as ShaderGraphNode;
      // Vertex first — it must match the declaration the READERS pick. Every
      // spec producer parses `${vertexSource}\n${fragmentSource}` with
      // first-wins dedup (uniformParser: `if (seen.has(name)) continue`), so
      // for a uniform declared in both stages the vertex declaration is the
      // one the Inspector shows. Writing fragment first would overwrite the
      // author's annotations on a declaration nobody reads, while the edit
      // itself stayed invisible.
      const vert = writeUniformHints(sn.vertexSource, name, hints);
      if (vert !== null) {
        get().updateShaderSource(id, { vertexSource: vert });
        return;
      }
      const frag = writeUniformHints(sn.fragmentSource, name, hints);
      if (frag !== null) get().updateShaderSource(id, { fragmentSource: frag });
      return;
    }
    if (node.kind === "compute") {
      const cn = node as ComputeGraphNode;
      const vert = writeUniformHints(cn.vertexSource, name, hints);
      if (vert !== null) get().updateComputeSource(id, vert);
    }
  },
  updateComputeSource: (id, vertexSource) => {
    pushHistory(get());
    set((s) => {
      const patched = s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "compute") return n;
        return { ...(n as ComputeGraphNode), vertexSource } as ComputeGraphNode;
      });
      // Deleting a uniform retires its input port; renaming one moves it.
      // A ComputeNode is single-document, so F2 commits through the editor
      // debounce like hand typing does — the rename is always inferred here.
      const r = reconciled(id, s.nodes, patched, s.edges);
      return { nodes: r.nodes, edges: r.edges, rev: s.rev + 1 };
    });
  },
  addEdge: (edge) => {
    pushHistory(get());
    set((s) => ({ edges: [...s.edges, edge], rev: s.rev + 1 }));
  },
  removeEdge: (id) => {
    pushHistory(get());
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id), rev: s.rev + 1 }));
  },
  reset: () => {
    pushHistory(get());
    set((s) => ({
      nodes: [],
      edges: [],
      positions: {},
      parents: {},
      rev: s.rev + 1,
      uniformRev: 0,
      graphEpoch: s.graphEpoch + 1,
    }));
  },
  ...createNodeConfigSlice(set, get, api),
  ...createGroupsSlice(set, get, api),
  applySnapshot: (snap) =>
    set((s) => {
      const parents = { ...snap.parents };
      return {
        nodes: orderParentsBeforeChildren(
          snap.nodes.map((n) => ({ ...n })),
          parents,
        ),
        edges: snap.edges.map((e) => ({ ...e })),
        positions: Object.fromEntries(
          Object.entries(snap.positions).map(([k, v]) => [
            k,
            { x: v.x, y: v.y },
          ]),
        ),
        parents,
        rev: s.rev + 1,
        graphEpoch: s.graphEpoch + 1,
      };
    }),
}));

export function snapshotGraph(): Graph {
  const s = useGraphStore.getState();
  return { nodes: s.nodes, edges: s.edges };
}

/** Snapshot the current live graph for the undo/redo stacks. */
function liveSnapshot(): GraphSnapshot {
  const s = useGraphStore.getState();
  return {
    nodes: s.nodes,
    edges: s.edges,
    positions: s.positions,
    parents: s.parents,
  };
}

/**
 * Pop the last history entry into the live graph. Since every mutation pushes
 * its *pre-mutation* snapshot, the top of `past` is exactly the state to return
 * to; the current live graph is handed to the store so it lands on the redo
 * stack.
 */
export function undoGraph(): boolean {
  const prev = useHistoryStore.getState().undo(liveSnapshot());
  if (!prev) return false;
  useGraphStore.getState().applySnapshot(prev);
  return true;
}

/** Re-apply the most recently undone graph. */
export function redoGraph(): boolean {
  const next = useHistoryStore.getState().redo(liveSnapshot());
  if (!next) return false;
  useGraphStore.getState().applySnapshot(next);
  return true;
}
