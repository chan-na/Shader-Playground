import { create } from "zustand";
import type { LogCategory, LogLevel } from "../utils/log";

/**
 * UI-only state for the developer diagnostics panel (Debugging-Plan P5): is the
 * panel open, and which level/category the log list is filtered to. Kept as a
 * leaf store — it imports only the log *types*, never other stores, so it stays
 * outside the store dependency graph (no circular risk).
 *
 * Filters use "all" as the unset sentinel rather than undefined so the
 * `<select>` values map 1:1 without exactOptionalPropertyTypes friction.
 */
type LevelFilter = LogLevel | "all";
type CategoryFilter = LogCategory | "all";

export interface DebugUiState {
  open: boolean;
  levelFilter: LevelFilter;
  categoryFilter: CategoryFilter;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setLevelFilter: (level: LevelFilter) => void;
  setCategoryFilter: (category: CategoryFilter) => void;
}

export const useDebugUiStore = create<DebugUiState>((set) => ({
  open: false,
  levelFilter: "all",
  categoryFilter: "all",
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setLevelFilter: (levelFilter) => set({ levelFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
}));
