import { create } from "zustand";
import type { LogCategory, LogLevel } from "../utils/log";

/**
 * UI-only state for status-bar-triggered transient overlays (Debugging-Plan
 * P5 + design v1.4 R5): the developer diagnostics panel (open, level/category
 * filters), the Problems overlay (problemsOpen), and the Pass Inspector
 * overlay (passesOpen). Kept as a leaf store — it imports only the log
 * *types*, never other stores, so it stays outside the store dependency
 * graph (no circular risk).
 *
 * Filters use "all" as the unset sentinel rather than undefined so the
 * `<select>` values map 1:1 without exactOptionalPropertyTypes friction.
 *
 * Mutual exclusion (design/CHANGELOG.md §v1.4 R5 — 하단 트랜지언트 오버레이는
 * dc상 단일 영역이라 diagnostics/problems가 동시에 열릴 수 없다(잠정 결정,
 * temp/design-followup-v1.4.md 기록)): the bottom 172px overlay region
 * (`Docking Prototype.dc.html` L210) hosts only one overlay at a time, so
 * opening one closes the other two. Closing (going to `false`) never touches
 * the other flags.
 *
 * **3-way 확장 (T1/D-1, Pass Inspector)**: design/ 정본(v2.2)은 이 슬롯이
 * diagnostics/problems 2종으로만 시분할된다고만 정의하고 Pass Inspector라는
 * 3번째 트랜지언트 오버레이를 다루지 않는다 — dc 미정의 지점의 잠정 결정이며
 * **design-request v2.3 (AA1)**로 디자이너에게 발행됐다(정본이 확정되면
 * 여기와 StatusOverlays.tsx/StatusBar.tsx를 함께 갱신). 기존 2원 배타
 * 패턴(끌 때는 나머지를 건드리지 않는다)을 그대로 3원으로 넓혔을 뿐, 슬롯이
 * 여전히 "하나만 열린다"는 불변식은 동일하다.
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
