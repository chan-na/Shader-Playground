import { create } from "zustand";

export interface RendererStats {
  fps: number;
  frame: number;
  drawCalls: number;
  errors: string[];
}

export interface RendererState {
  ready: boolean;
  stats: RendererStats;
  setReady: (ready: boolean) => void;
  setStats: (stats: Partial<RendererStats>) => void;
  pushError: (msg: string) => void;
  clearErrors: () => void;
}

export const useRendererStore = create<RendererState>((set) => ({
  ready: false,
  stats: { fps: 0, frame: 0, drawCalls: 0, errors: [] },
  setReady: (ready) => set({ ready }),
  setStats: (patch) => set((s) => ({ stats: { ...s.stats, ...patch } })),
  pushError: (msg) =>
    set((s) => ({
      stats: { ...s.stats, errors: [...s.stats.errors, msg] },
    })),
  clearErrors: () => set((s) => ({ stats: { ...s.stats, errors: [] } })),
}));
