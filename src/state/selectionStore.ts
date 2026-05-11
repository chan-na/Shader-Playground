import { create } from "zustand";

export interface SelectionState {
  selectedNodeId: string | null;
  select: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeId: null,
  select: (id) => set({ selectedNodeId: id }),
}));
