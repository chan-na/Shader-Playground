import { create } from "zustand";

/**
 * Export & Share dialog's target surface. `gif`/`webm` rail items exist from
 * M6-U3 onward (the rail always shows all four), but their recording
 * configure/encoding flow is out of scope here — only `html`/`link` render a
 * functional configure panel this unit (M6-U4 is expected to wire up
 * recording, hence the union already reserves the two keys).
 */
export type ExportTarget = "gif" | "webm" | "html" | "link";

export interface ExportShareState {
  open: boolean;
  target: ExportTarget;
  /** Opens the dialog directly onto `target` (AppToolbar's Share / Export
   * HTML buttons use this instead of reaching into dialog-local state). */
  openWith: (target: ExportTarget) => void;
  setTarget: (target: ExportTarget) => void;
  close: () => void;
}

export const useExportShareStore = create<ExportShareState>((set) => ({
  open: false,
  target: "gif",
  openWith: (target) => set({ open: true, target }),
  setTarget: (target) => set({ target }),
  close: () => set({ open: false }),
}));
