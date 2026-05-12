import { create } from "zustand";

export interface ViewportSettings {
  background: [number, number, number];
  /** Bumped on every viewport setting mutation; RAF loop reads this to detect idle. */
  rev: number;
  setBackground: (rgb: [number, number, number]) => void;
}

export const useViewportStore = create<ViewportSettings>((set) => ({
  background: [0.07, 0.07, 0.09],
  rev: 0,
  setBackground: (rgb) => set((s) => ({ background: rgb, rev: s.rev + 1 })),
}));
