import { create } from "zustand";
import type { LogCategory, LogLevel } from "../utils/log";

/**
 * UI-only state for status-bar-triggered transient overlays (Debugging-Plan
 * P5 + design v1.4 R5): the developer diagnostics panel (open, level/category
 * filters) and the Problems overlay (problemsOpen). Kept as a leaf store — it
 * imports only the log *types*, never other stores, so it stays outside the
 * store dependency graph (no circular risk).
 *
 * Filters use "all" as the unset sentinel rather than undefined so the
 * `<select>` values map 1:1 without exactOptionalPropertyTypes friction.
 *
 * Mutual exclusion (design/CHANGELOG.md §v1.4 R5 — 하단 트랜지언트 오버레이는
 * dc상 단일 영역이라 diagnostics/problems가 동시에 열릴 수 없다(잠정 결정,
 * temp/design-followup-v1.4.md 기록)): the bottom 172px overlay region
 * (`Docking Prototype.dc.html` L210) hosts only one overlay at a time, so
 * opening one closes the other. Closing (going to `false`) never touches the
 * other flag.
 */
type LevelFilter = LogLevel | "all";
type CategoryFilter = LogCategory | "all";

export interface DebugUiState {
  open: boolean;
  problemsOpen: boolean;
  levelFilter: LevelFilter;
  categoryFilter: CategoryFilter;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setProblemsOpen: (open: boolean) => void;
  toggleProblems: () => void;
  setLevelFilter: (level: LevelFilter) => void;
  setCategoryFilter: (category: CategoryFilter) => void;
}

export const useDebugUiStore = create<DebugUiState>((set) => ({
  open: false,
  problemsOpen: false,
  levelFilter: "all",
  categoryFilter: "all",
  setOpen: (open) => set(open ? { open, problemsOpen: false } : { open }),
  toggleOpen: () =>
    set((s) =>
      s.open ? { open: false } : { open: true, problemsOpen: false },
    ),
  setProblemsOpen: (problemsOpen) =>
    set(problemsOpen ? { problemsOpen, open: false } : { problemsOpen }),
  toggleProblems: () =>
    set((s) =>
      s.problemsOpen
        ? { problemsOpen: false }
        : { problemsOpen: true, open: false },
    ),
  setLevelFilter: (levelFilter) => set({ levelFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
}));
