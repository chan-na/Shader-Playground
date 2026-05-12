import { create } from "zustand";

interface RendererStats {
  fps: number;
  frame: number;
  drawCalls: number;
  /**
   * Monotonic counter incremented each time the RAF loop actually calls
   * `executePlan`. Idle frames (static graph guard, see Viewport) do NOT bump
   * it. Surfaces "is the loop doing GPU work?" without depending on the
   * 500 ms FPS window.
   */
  renderTick: number;
  errors: string[];
}

export interface RendererState {
  ready: boolean;
  stats: RendererStats;
  setReady: (ready: boolean) => void;
  setStats: (stats: Partial<RendererStats>) => void;
  bumpRenderTick: () => void;
  pushError: (msg: string) => void;
  clearErrors: () => void;
}

export const useRendererStore = create<RendererState>((set) => ({
  ready: false,
  stats: { fps: 0, frame: 0, drawCalls: 0, renderTick: 0, errors: [] },
  setReady: (ready) => set({ ready }),
  setStats: (patch) => set((s) => ({ stats: { ...s.stats, ...patch } })),
  bumpRenderTick: () =>
    set((s) => ({
      stats: { ...s.stats, renderTick: s.stats.renderTick + 1 },
    })),
  pushError: (msg) =>
    set((s) => ({
      stats: { ...s.stats, errors: [...s.stats.errors, msg] },
    })),
  clearErrors: () => set((s) => ({ stats: { ...s.stats, errors: [] } })),
}));
