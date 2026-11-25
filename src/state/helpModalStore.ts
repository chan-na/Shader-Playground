import { create } from "zustand";

/**
 * Keyboard-shortcut help modal open/closed state. `HelpModal` subscribes to
 * it; the AppToolbar's help button toggles it without importing the modal.
 */
interface HelpModalState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useHelpModalStore = create<HelpModalState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
