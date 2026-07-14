import { create } from "zustand";

/**
 * init  — session restore hasn't started/finished yet (share hash decode,
 *         autosave lookup). Graph/side-panel show loading skeletons.
 * prompt — a stale autosave was found; RecoveryDialog is up asking to
 *         restore/discard. Skeletons stay up behind the dialog.
 * done  — graph is populated (demo, restored, share, or discard fallback)
 *         and autosave has started. Real content renders.
 */
type BootstrapPhase = "init" | "prompt" | "done";

export interface BootstrapStoreState {
  phase: BootstrapPhase;
  setPhase: (p: BootstrapPhase) => void;
}

export const useBootstrapStore = create<BootstrapStoreState>((set) => ({
  phase: "init",
  setPhase: (p) => set({ phase: p }),
}));
