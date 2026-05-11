import { create } from 'zustand';

export interface ViewportSettings {
  background: [number, number, number];
  setBackground: (rgb: [number, number, number]) => void;
}

export const useViewportStore = create<ViewportSettings>((set) => ({
  background: [0.07, 0.07, 0.09],
  setBackground: (rgb) => set({ background: rgb }),
}));
