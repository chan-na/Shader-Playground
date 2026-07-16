import { create } from "zustand";
import {
  allDescendants,
  getAbsolutePosition,
  orderParentsBeforeChildren,
  type ParentsMap,
  relativePositionFor,
  wouldCreateParentCycle,
} from "../core/graph/parents";
import type {
  AudioFftSize,
  AudioGraphNode,
  AudioSourceKind,
  CombineArity,
  CombineGraphNode,
  ComputeAttribute,
  ComputeGraphNode,
  ComputePrimitive,
  Graph,
  GraphEdge,
  GraphNode,
  GroupGraphNode,
  MathGraphNode,
  MathOp,
  ParamGraphNode,
  ResolutionScale,
  ShaderGraphNode,
  SwizzleGraphNode,
  VideoGraphNode,
  WebcamGraphNode,
} from "../core/graph/types";
import {
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  GROUP_SELECTION_PADDING,
} from "../core/graph/types";
import type { UniformHints } from "../core/graph/uniformParser";
import { writeUniformHints } from "../core/graph/uniformParser";
import { nextId } from "../utils/id";
import { type GraphSnapshot, useHistoryStore } from "./historyStore";
import type { NodePosition } from "./types";

type GroupRemoveMode = "delete-children" | "release-children";

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Record<string, NodePosition>;
  /** Child → parent group id. Absent entry ⇒ top-level. */
  parents: ParentsMap;
  rev: number; // bumped on structural change (re-compile trigger)
  uniformRev: number; // bumped on uniform-only change

  setGraph: (
    g: Graph,
    positions?: Record<string, NodePosition>,
    parents?: ParentsMap,
  ) => void;
  addNode: (node: GraphNode, position?: NodePosition) => void;
  /**
   * Deep-clone a node under a fresh id, offset slightly from the original.
   * Edges are intentionally NOT duplicated. Returns the new id, or null when
   * the source id is unknown.
   */
  cloneNode: (id: string) => string | null;
  removeNode: (id: string) => void;
  /**
   * Set a node's user-facing display name [D15]. Trimmed and clamped to
   * `SANITIZE_LIMITS.MAX_NODE_NAME_LEN` (256). An empty result after
   * trimming removes the `name` property (falls back to the registry's
   * default display name) rather than storing `""`. No-op for group nodes —
   * `label` is their single rename source (GroupNodeView/GroupInspector),
   * to avoid two competing rename UIs. No-op (no history push) when the
   * normalized name already matches the node's current name.
   */
  renameNode: (id: string, name: string) => void;
  updateNodePosition: (id: string, position: NodePosition) => void;
  /**
   * Translate several nodes at once by (dx, dy) in flow coordinates. Used by
   * the arrow-key nudge for multi-selection. Like drags, this does not bump
   * `rev` or push history — node position is non-structural. Unknown ids are
   * ignored.
   */
  nudgeNodes: (ids: string[], dx: number, dy: number) => void;
  updateShaderSource: (
    id: string,
    patch: { vertexSource?: string; fragmentSource?: string },
  ) => void;
  setUniformValue: (id: string, name: string, value: number | number[]) => void;
  /**
   * Write Inspector hint annotations (range/step/default/label) back into the
   * uniform declaration's GLSL source comment. Routes through the structural
   * source-update path so the change recompiles and re-derives the spec.
   */
  setUniformHints: (id: string, name: string, hints: UniformHints) => void;
  setResolutionScale: (id: string, scale: ResolutionScale) => void;
  setParamValue: (id: string, value: number | number[]) => void;
  setParamLabel: (id: string, label: string) => void;
  setMathConfig: (
    id: string,
    patch: { op?: MathOp; a?: number; b?: number },
  ) => void;
  setSwizzleMask: (id: string, mask: string) => void;
  setCombineConfig: (
    id: string,
    patch: { arity?: CombineArity; values?: [number, number, number, number] },
  ) => void;
  updateComputeSource: (id: string, vertexSource: string) => void;
  setComputeConfig: (
    id: string,
    patch: {
      count?: number;
      primitive?: ComputePrimitive;
      attributes?: ComputeAttribute[];
    },
  ) => void;
  setWebcamConfig: (id: string, patch: { deviceId?: string }) => void;
  setVideoConfig: (
    id: string,
    patch: {
      assetId?: string | null;
      playing?: boolean;
      loop?: boolean;
      muted?: boolean;
      currentTime?: number;
    },
  ) => void;
  setAudioConfig: (
    id: string,
    patch: {
      sourceKind?: AudioSourceKind;
      assetId?: string | null;
      fftSize?: AudioFftSize;
      smoothing?: number;
      playing?: boolean;
      loop?: boolean;
    },
  ) => void;
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  reset: () => void;

  /**
   * Create a new group node at the given absolute position and size. Returns
   * the new node id. If `parentId` is given the group becomes a sub-group
   * (positions are converted to parent-relative).
   */
  addGroup: (
    label: string,
    absolutePosition: NodePosition,
    size: { width: number; height: number },
    options?: { parentId?: string; color?: string },
  ) => string;
  /**
   * Set or clear a node's parent. Maintains visual location by recomputing
   * the node's parent-relative position. Returns true on success, false when
   * the move would form a cycle or the node is unknown.
   */
  setParent: (id: string, newParentId: string | undefined) => boolean;
  /**
   * Wrap the given node ids in a new group sized to their bounding box.
   * Returns the new group id, or null when fewer than 1 node is provided or
   * none of the ids exist. The new group inherits the *common* parent of
   * the selection (nested groups arise naturally).
   */
  groupSelected: (ids: string[]) => string | null;
  /**
   * Remove a group node. `mode === 'delete-children'` cascades through
   * descendants; `'release-children'` promotes direct children up to the
   * group's own parent (or top-level) while preserving their absolute
   * positions. No-op if `id` is not a group node.
   */
  removeGroup: (id: string, mode: GroupRemoveMode) => void;
  setGroupLabel: (id: string, label: string) => void;
  setGroupColor: (id: string, color: string | undefined) => void;
  setGroupSize: (id: string, size: { width: number; height: number }) => void;
  /**
   * Flip a group between collapsed (header-only, descendants hidden) and
   * expanded. Structural-tier (rev + history) so the state is undoable and
   * auto-saved; recompile is a no-op since groups never enter the plan. No-op
   * when `id` is unknown or not a group.
   */
  toggleGroupCollapsed: (id: string) => void;

  /** Replace state without bumping history (used by undo/redo). */
  applySnapshot: (snap: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Record<string, NodePosition>;
    parents: ParentsMap;
  }) => void;
}

function pushHistory(s: GraphState) {
  useHistoryStore.getState().push({
    nodes: s.nodes.map((n) => ({ ...n })),
    edges: s.edges.map((e) => ({ ...e })),
    positions: Object.fromEntries(
      Object.entries(s.positions).map(([k, v]) => [k, { x: v.x, y: v.y }]),
    ),
    parents: { ...s.parents },
  });
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  positions: {},
  parents: {},
  rev: 0,
  uniformRev: 0,
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
    pushHistory(get());
    set((s) => ({
      nodes: [...s.nodes, clone],
      positions: srcPos
        ? { ...s.positions, [newId]: { x: srcPos.x + 40, y: srcPos.y + 40 } }
        : s.positions,
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
    // Clamp mirrors SANITIZE_LIMITS.MAX_NODE_NAME_LEN (projectSanitize.ts) —
    // kept as a literal here rather than importing the sanitize module to
    // avoid a state↔state-adjacent import for a single constant.
    const trimmed = name.trim().slice(0, 256);
    const target = get().nodes.find((n) => n.id === id);
    if (!target) return;
    if (target.kind === "group") return;
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
      const positions = { ...s.positions };
      let changed = false;
      for (const id of ids) {
        const p = positions[id];
        if (!p) continue;
        positions[id] = { x: p.x + dx, y: p.y + dy };
        changed = true;
      }
      return changed ? { positions } : {};
    }),
  updateShaderSource: (id, patch) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "shader") return n;
        const sn = n as ShaderGraphNode;
        return {
          ...sn,
          vertexSource: patch.vertexSource ?? sn.vertexSource,
          fragmentSource: patch.fragmentSource ?? sn.fragmentSource,
        };
      }),
      rev: s.rev + 1,
    }));
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
      const frag = writeUniformHints(sn.fragmentSource, name, hints);
      if (frag !== null) {
        get().updateShaderSource(id, { fragmentSource: frag });
        return;
      }
      const vert = writeUniformHints(sn.vertexSource, name, hints);
      if (vert !== null) get().updateShaderSource(id, { vertexSource: vert });
      return;
    }
    if (node.kind === "compute") {
      const cn = node as ComputeGraphNode;
      const vert = writeUniformHints(cn.vertexSource, name, hints);
      if (vert !== null) get().updateComputeSource(id, vert);
    }
  },
  setResolutionScale: (id, scale) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "shader") return n;
        return { ...(n as ShaderGraphNode), resolutionScale: scale };
      }),
      rev: s.rev + 1,
    }));
  },
  setParamValue: (id, value) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "param") return n;
        return { ...(n as ParamGraphNode), value } as ParamGraphNode;
      }),
      uniformRev: s.uniformRev + 1,
    })),
  setParamLabel: (id, label) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "param") return n;
        return { ...(n as ParamGraphNode), label } as ParamGraphNode;
      }),
      rev: s.rev + 1,
    }));
  },
  setMathConfig: (id, patch) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "math") return n;
        const mn = n as MathGraphNode;
        return {
          ...mn,
          op: patch.op ?? mn.op,
          a: patch.a ?? mn.a,
          b: patch.b ?? mn.b,
        } as MathGraphNode;
      }),
      rev: s.rev + 1,
    }));
  },
  setSwizzleMask: (id, mask) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "swizzle") return n;
        return { ...(n as SwizzleGraphNode), mask } as SwizzleGraphNode;
      }),
      rev: s.rev + 1,
    }));
  },
  setCombineConfig: (id, patch) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "combine") return n;
        const cn = n as CombineGraphNode;
        return {
          ...cn,
          arity: patch.arity ?? cn.arity,
          values: patch.values
            ? [
                patch.values[0],
                patch.values[1],
                patch.values[2],
                patch.values[3],
              ]
            : cn.values,
        } as CombineGraphNode;
      }),
      rev: s.rev + 1,
    }));
  },
  updateComputeSource: (id, vertexSource) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "compute") return n;
        return { ...(n as ComputeGraphNode), vertexSource } as ComputeGraphNode;
      }),
      rev: s.rev + 1,
    }));
  },
  setComputeConfig: (id, patch) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "compute") return n;
        const cn = n as ComputeGraphNode;
        return {
          ...cn,
          count: patch.count ?? cn.count,
          primitive: patch.primitive ?? cn.primitive,
          attributes: patch.attributes
            ? patch.attributes.map((a) => ({ ...a }))
            : cn.attributes,
        } as ComputeGraphNode;
      }),
      rev: s.rev + 1,
    }));
  },
  setWebcamConfig: (id, patch) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "webcam") return n;
        const wn = n as WebcamGraphNode;
        // Empty string from the Inspector dropdown maps to "default device"
        // (the undefined branch); anything else is a concrete deviceId.
        const incoming =
          patch.deviceId !== undefined
            ? patch.deviceId || undefined
            : wn.deviceId;
        const next: WebcamGraphNode = { id: wn.id, kind: "webcam" };
        if (incoming !== undefined) next.deviceId = incoming;
        return next;
      }),
      rev: s.rev + 1,
    }));
  },
  setVideoConfig: (id, patch) => {
    // Scrub slider can fire dozens of currentTime updates per second; pushing
    // history on each one would flood the undo stack and discard meaningful
    // prior edits. Treat currentTime-only changes as uniform-tier (no history,
    // no structural rev bump) so the registry's RAF still picks up the seek.
    const isScrubOnly =
      patch.assetId === undefined &&
      patch.playing === undefined &&
      patch.loop === undefined &&
      patch.muted === undefined &&
      patch.currentTime !== undefined;
    if (!isScrubOnly) pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "video") return n;
        const vn = n as VideoGraphNode;
        const next: VideoGraphNode = {
          id: vn.id,
          kind: "video",
          assetId: patch.assetId !== undefined ? patch.assetId : vn.assetId,
          playing: patch.playing ?? vn.playing,
          loop: patch.loop ?? vn.loop,
          muted: patch.muted ?? vn.muted,
        };
        const nextTime =
          patch.currentTime !== undefined ? patch.currentTime : vn.currentTime;
        if (nextTime !== undefined) next.currentTime = nextTime;
        return next;
      }),
      ...(isScrubOnly ? { uniformRev: s.uniformRev + 1 } : { rev: s.rev + 1 }),
    }));
  },
  setAudioConfig: (id, patch) => {
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "audio") return n;
        const an = n as AudioGraphNode;
        const next: AudioGraphNode = {
          id: an.id,
          kind: "audio",
          sourceKind: patch.sourceKind ?? an.sourceKind,
          assetId: patch.assetId !== undefined ? patch.assetId : an.assetId,
          fftSize: patch.fftSize ?? an.fftSize,
          smoothing: patch.smoothing ?? an.smoothing,
          playing: patch.playing ?? an.playing,
          loop: patch.loop ?? an.loop,
        };
        return next;
      }),
      rev: s.rev + 1,
    }));
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
    }));
  },
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
      const selectedSet = new Set(valid);
      const restNoSelection = cur.nodes.filter((n) => !selectedSet.has(n.id));
      const selectionInOrder = cur.nodes.filter((n) => selectedSet.has(n.id));
      const nodes = [...restNoSelection, groupNode, ...selectionInOrder];

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
