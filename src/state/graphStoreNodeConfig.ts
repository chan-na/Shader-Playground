import type { StateCreator } from "zustand";
import type {
  AudioGraphNode,
  CombineGraphNode,
  ComputeGraphNode,
  MathGraphNode,
  MeshGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
  SwizzleGraphNode,
  VideoGraphNode,
  WebcamGraphNode,
} from "../core/graph/types";
import { pushHistory, reconciled } from "./graphStoreHelpers";
import type { GraphState } from "./graphStoreTypes";

type NodeConfigSlice = Pick<
  GraphState,
  | "setResolutionScale"
  | "setParamValue"
  | "setMathConfig"
  | "setSwizzleMask"
  | "setMeshPrimitive"
  | "setCombineConfig"
  | "setComputeConfig"
  | "setWebcamConfig"
  | "setVideoConfig"
  | "setAudioConfig"
>;

/**
 * Per-kind node configuration setters (Inspector / node-view controls). Each
 * keeps its own history/rev tier: structural edits push history and bump
 * `rev`, while high-frequency value edits (param value, video scrub) bump
 * `uniformRev` only.
 */
export const createNodeConfigSlice: StateCreator<
  GraphState,
  [],
  [],
  NodeConfigSlice
> = (set, get) => ({
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
  setMathConfig: (id, patch) => {
    pushHistory(get());
    set((s) => {
      const patched = s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "math") return n;
        const mn = n as MathGraphNode;
        return {
          ...mn,
          op: patch.op ?? mn.op,
          a: patch.a ?? mn.a,
          b: patch.b ?? mn.b,
        } as MathGraphNode;
      });
      // Switching to a unary op retires the `b` port.
      const r = reconciled(id, s.nodes, patched, s.edges);
      return { nodes: r.nodes, edges: r.edges, rev: s.rev + 1 };
    });
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
  setMeshPrimitive: (id, primitive) => {
    const target = get().nodes.find((n) => n.id === id);
    if (!target || target.kind !== "mesh") return;
    pushHistory(get());
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== "mesh") return n;
        // Choosing a built-in primitive releases the custom mesh asset.
        return { ...(n as MeshGraphNode), primitive, assetId: null };
      }),
      rev: s.rev + 1,
    }));
  },
  setCombineConfig: (id, patch) => {
    pushHistory(get());
    set((s) => {
      const patched = s.nodes.map((n) => {
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
      });
      // Lowering the arity retires the channels above it.
      const r = reconciled(id, s.nodes, patched, s.edges);
      return { nodes: r.nodes, edges: r.edges, rev: s.rev + 1 };
    });
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
});
