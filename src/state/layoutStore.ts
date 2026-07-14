import { create } from "zustand";

/** leftFrac / viewportFrac은 스플리터가 벗어날 수 없는 안전 범위. */
const FRAC_MIN = 0.2;
const FRAC_MAX = 0.8;

/** 코드 에디터 하단 독의 높이(px) 허용 범위. */
const CODE_HEIGHT_MIN = 120;
const CODE_HEIGHT_MAX = 640;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 4개 도킹 패널의 식별자. DockPanelHeader/App.tsx 슬롯 매핑에 공용으로 쓰인다. */
export type PanelId = "nodeEditor" | "viewport" | "sidePanel" | "codeEditor";

const INITIAL_COLLAPSED: Record<PanelId, boolean> = {
  nodeEditor: false,
  viewport: false,
  sidePanel: false,
  codeEditor: false,
};

export interface LayoutState {
  /** shell-left(Node Editor) : shell-right 폭 비율. 디자인 flex:1.42/2.42. */
  leftFrac: number;
  /** shell-right 내부 Viewport : Side Panel 높이 비율. 디자인 flex:1.25/2.25. */
  viewportFrac: number;
  /** 하단 Code Editor 독의 높이(px). 디자인 height:232px. */
  codeHeight: number;
  /** 패널별 접힘 상태(헤더만 남기고 본문 숨김). */
  collapsed: Record<PanelId, boolean>;
  /** 현재 최대화된 패널(단일). 없으면 null. */
  maximized: PanelId | null;
  setLeftFrac: (frac: number) => void;
  setViewportFrac: (frac: number) => void;
  setCodeHeight: (px: number) => void;
  /** 지정한 패널의 접힘 상태를 반전한다. */
  toggleCollapsed: (id: PanelId) => void;
  /**
   * 지정한 패널의 최대화 상태를 토글한다. 이미 최대화된 패널을 다시 호출하면
   * 복원(null)된다. 새로 최대화하는 패널은 접혀 있었다면 강제로 펼친다 —
   * 접힌 채로 최대화되면 본문이 보이지 않는 상태가 되어버리기 때문.
   */
  toggleMaximized: (id: PanelId) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  leftFrac: 1.42 / 2.42,
  viewportFrac: 1.25 / 2.25,
  codeHeight: 232,
  collapsed: { ...INITIAL_COLLAPSED },
  maximized: null,
  setLeftFrac: (frac) => set({ leftFrac: clamp(frac, FRAC_MIN, FRAC_MAX) }),
  setViewportFrac: (frac) =>
    set({ viewportFrac: clamp(frac, FRAC_MIN, FRAC_MAX) }),
  setCodeHeight: (px) =>
    set({ codeHeight: clamp(px, CODE_HEIGHT_MIN, CODE_HEIGHT_MAX) }),
  toggleCollapsed: (id) =>
    set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
  toggleMaximized: (id) =>
    set((s) => {
      if (s.maximized === id) return { maximized: null };
      return {
        maximized: id,
        collapsed: s.collapsed[id]
          ? { ...s.collapsed, [id]: false }
          : s.collapsed,
      };
    }),
}));
