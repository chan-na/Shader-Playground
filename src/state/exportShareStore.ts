import { create } from "zustand";

/**
 * Export & Share dialog's target surface. The rail always shows all four
 * targets; `gif`/`webm` drive the recording flow, `html`/`link` render the
 * export/share configure panels.
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
