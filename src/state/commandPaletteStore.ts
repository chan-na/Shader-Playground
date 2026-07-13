import { create } from "zustand";

/**
 * Command Palette open/closed state (M1-U3).
 *
 * Pulled out of `CommandPalette`'s local `useState` so the AppToolbar's
 * "Search" button can open the palette without importing the component
 * itself (which would also need to reach back into the toolbar for the
 * ⌘K keydown listener — a store is the natural single source of truth
 * both sides subscribe to).
 */
export interface CommandPaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
