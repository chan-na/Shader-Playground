import { create } from "zustand";
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
  MathGraphNode,
  MathOp,
  ParamGraphNode,
  ResolutionScale,
  ShaderGraphNode,
  SwizzleGraphNode,
  VideoGraphNode,
  WebcamGraphNode,
} from "../core/graph/types";
import { nextId } from "../utils/id";
import { useHistoryStore } from "./historyStore";
import type { NodePosition } from "./types";

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Record<string, NodePosition>;
  rev: number; // bumped on structural change (re-compile trigger)
  uniformRev: number; // bumped on uniform-only change

  setGraph: (g: Graph, positions?: Record<string, NodePosition>) => void;
  addNode: (node: GraphNode, position?: NodePosition) => void;
  /**
   * Deep-clone a node under a fresh id, offset slightly from the original.
   * Edges are intentionally NOT duplicated. Returns the new id, or null when
   * the source id is unknown.
   */
  cloneNode: (id: string) => string | null;
  removeNode: (id: string) => void;
  updateNodePosition: (id: string, position: NodePosition) => void;
  updateShaderSource: (
    id: string,
    patch: { vertexSource?: string; fragmentSource?: string },
  ) => void;
  setUniformValue: (id: string, name: string, value: number | number[]) => void;
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

  /** Replace state without bumping history (used by undo/redo). */
  applySnapshot: (snap: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Record<string, NodePosition>;
  }) => void;
}

function pushHistory(s: GraphState) {
  useHistoryStore.getState().push({
    nodes: s.nodes.map((n) => ({ ...n })),
    edges: s.edges.map((e) => ({ ...e })),
    positions: Object.fromEntries(
      Object.entries(s.positions).map(([k, v]) => [k, { x: v.x, y: v.y }]),
    ),
  });
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  positions: {},
  rev: 0,
  uniformRev: 0,
  setGraph: (g, positions) => {
    pushHistory(get());
    set((s) => ({
      nodes: g.nodes,
      edges: g.edges,
      positions: positions ?? s.positions,
      rev: s.rev + 1,
    }));
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
      delete positions[id];
      return {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        positions,
        rev: s.rev + 1,
      };
    });
  },
  updateNodePosition: (id, position) =>
    set((s) => ({ positions: { ...s.positions, [id]: position } })),
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
      rev: s.rev + 1,
      uniformRev: 0,
    }));
  },
  applySnapshot: (snap) =>
    set((s) => ({
      nodes: snap.nodes.map((n) => ({ ...n })),
      edges: snap.edges.map((e) => ({ ...e })),
      positions: Object.fromEntries(
        Object.entries(snap.positions).map(([k, v]) => [k, { x: v.x, y: v.y }]),
      ),
      rev: s.rev + 1,
    })),
}));

export function snapshotGraph(): Graph {
  const s = useGraphStore.getState();
  return { nodes: s.nodes, edges: s.edges };
}

/** Pop the last history entry into the live graph. */
export function undoGraph(): boolean {
  const prev = useHistoryStore.getState().undo();
  if (!prev) return false;
  useGraphStore.getState().applySnapshot(prev);
  return true;
}

/** Re-apply the most recently undone graph. */
export function redoGraph(): boolean {
  const next = useHistoryStore.getState().redo();
  if (!next) return false;
  useGraphStore.getState().applySnapshot(next);
  return true;
}
