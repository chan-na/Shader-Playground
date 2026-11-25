import { create } from "zustand";
import type { LogCategory, LogLevel } from "../utils/log";

/**
 * UI-only state for status-bar-triggered transient overlays: the developer
 * diagnostics panel (open, level/category filters), the Problems overlay
 * (problemsOpen), and the Pass Inspector overlay (passesOpen). Kept as a
 * leaf store — it imports only the log *types*, never other stores, so it
 * stays outside the store dependency graph (no circular risk).
 *
 * Filters use "all" as the unset sentinel rather than undefined so the
 * `<select>` values map 1:1 without exactOptionalPropertyTypes friction.
 *
 * Mutual exclusion: the bottom 172px overlay region (design/App Shell.dc.html
 * bottom transient overlay) is a single slot, so only one overlay is open at
 * a time — opening one closes the other two. Closing (going to `false`)
 * never touches the other flags.
 *
 * Pass Inspector(docs/learnability-plan-2026-08.md D-1)가 이 슬롯의 3번째
 * 점유자다. design/ 정본은 diagnostics/problems 2종만 정의하므로 이는 잠정
 * 결정이다 — 정본이 바뀌면 여기와 StatusOverlays.tsx/StatusBar.tsx를 함께
 * 갱신한다. "하나만 열린다"는 불변식은 동일하다.
 */
type LevelFilter = LogLevel | "all";
type CategoryFilter = LogCategory | "all";

export interface DebugUiState {
  open: boolean;
  problemsOpen: boolean;
  passesOpen: boolean;
  levelFilter: LevelFilter;
  categoryFilter: CategoryFilter;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setProblemsOpen: (open: boolean) => void;
  toggleProblems: () => void;
  setPassesOpen: (open: boolean) => void;
  togglePasses: () => void;
  setLevelFilter: (level: LevelFilter) => void;
  setCategoryFilter: (category: CategoryFilter) => void;
}

export const useDebugUiStore = create<DebugUiState>((set) => ({
  open: false,
  problemsOpen: false,
  passesOpen: false,
  levelFilter: "all",
  categoryFilter: "all",
  setOpen: (open) =>
    set(open ? { open, problemsOpen: false, passesOpen: false } : { open }),
  toggleOpen: () =>
    set((s) =>
      s.open
        ? { open: false }
        : { open: true, problemsOpen: false, passesOpen: false },
    ),
  setProblemsOpen: (problemsOpen) =>
    set(
      problemsOpen
        ? { problemsOpen, open: false, passesOpen: false }
        : { problemsOpen },
    ),
  toggleProblems: () =>
    set((s) =>
      s.problemsOpen
        ? { problemsOpen: false }
        : { problemsOpen: true, open: false, passesOpen: false },
    ),
  setPassesOpen: (passesOpen) =>
    set(
      passesOpen
        ? { passesOpen, open: false, problemsOpen: false }
        : { passesOpen },
    ),
  togglePasses: () =>
    set((s) =>
      s.passesOpen
        ? { passesOpen: false }
        : { passesOpen: true, open: false, problemsOpen: false },
    ),
  setLevelFilter: (levelFilter) => set({ levelFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
}));
