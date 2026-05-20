import { create } from "zustand";

/**
 * Raw GPU timer samples land here from the RAF loop. Per-node values are
 * EMA-smoothed because raw timings jitter frame-to-frame; the smoothed value
 * is what UI chips read. `totalMs` is the sum of the smoothed per-node values
 * recomputed on every `setSample`.
 *
 * `supported` reflects whether `EXT_disjoint_timer_query_webgl2` exposed on
 * the active GL context; `enabled` is a user toggle. The combination of both
 * gates the begin/end calls in `executePlan`.
 */
const EMA_ALPHA = 0.2;

export interface GpuTimerState {
  byNode: Record<string, number>;
  totalMs: number;
  supported: boolean;
  enabled: boolean;
  setSupported: (supported: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setSample: (nodeId: string, ms: number) => void;
  removeNode: (nodeId: string) => void;
  reset: () => void;
}

function sumValues(record: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(record)) total += v;
  return total;
}

export const useGpuTimerStore = create<GpuTimerState>((set) => ({
  byNode: {},
  totalMs: 0,
  supported: false,
  enabled: true,
  setSupported: (supported) =>
    set((s) =>
      supported === s.supported
        ? s
        : supported
          ? { ...s, supported }
          : // Drop stale samples when timing goes away (context lost, etc.).
            { ...s, supported, byNode: {}, totalMs: 0 },
    ),
  setEnabled: (enabled) =>
    set((s) =>
      enabled === s.enabled
        ? s
        : enabled
          ? { ...s, enabled }
          : { ...s, enabled, byNode: {}, totalMs: 0 },
    ),
  toggleEnabled: () =>
    set((s) => {
      const enabled = !s.enabled;
      return enabled
        ? { ...s, enabled }
        : { ...s, enabled, byNode: {}, totalMs: 0 };
    }),
  setSample: (nodeId, ms) =>
    set((s) => {
      const prev = s.byNode[nodeId];
      const next = prev === undefined ? ms : prev + (ms - prev) * EMA_ALPHA;
      const byNode = { ...s.byNode, [nodeId]: next };
      return { ...s, byNode, totalMs: sumValues(byNode) };
    }),
  removeNode: (nodeId) =>
    set((s) => {
      if (s.byNode[nodeId] === undefined) return s;
      const byNode = { ...s.byNode };
      delete byNode[nodeId];
      return { ...s, byNode, totalMs: sumValues(byNode) };
    }),
  reset: () => set((s) => ({ ...s, byNode: {}, totalMs: 0 })),
}));
