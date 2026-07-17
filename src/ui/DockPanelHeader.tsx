import type { ReactNode } from "react";
import { type PanelId, useLayoutStore } from "../state/layoutStore";

export interface DockPanelHeaderProps {
  panelId: PanelId;
  /** 대문자로 렌더되는 패널 라벨. 탭이 라벨 자리를 대신하는 패널(Side Panel /
   *  Code Editor)은 생략하고 `children`으로 탭을 넘긴다. */
  label?: string;
  /** mono 메타 배지(예: "5N · 4E", "GLSL · ES 3.0"). */
  meta?: string;
  /**
   * 메타 배지 위치 [D13]: 기본 "start"는 label/children 옆(좌측) — 기존
   * 패널(Node Editor "5N · 4E", Viewport)의 동작을 보존한다. "end"는
   * spacer 뒤(최대화 버튼 앞) 우측 정렬 — App Shell.dc.html L361-369의
   * Code Editor 정본 순서.
   *
   * 배지 박스 스타일 정본 확정(v1.3 Q4): metaAlign="end"에서도 배경+보더
   * 배지 박스가 정본이다(plain mono 텍스트 변형 없음 — 공통 컴포넌트
   * 일관성 우선). v1.2 무응답으로 미확정이던 지점을 dc가 이 구현으로
   * 정정(App Shell 'GLSL · ES 3.0' plain mono → 배지 박스) —
   * design/README.md §도메인 [D13] Q4 문단 · design/CHANGELOG.md §v1.3 Q4.
   */
  metaAlign?: "start" | "end";
  /** 탭 버튼 등 헤더 중앙에 끼워 넣을 슬롯. */
  children?: ReactNode;
  /**
   * true면 이 패널이 접혔을 때 App.tsx가 슬롯을 '폭'으로 줄인다(현재는
   * shell-left/Node Editor뿐 — viewport/sidePanel/codeEditor는 '높이'로
   * 줄어 가로 헤더 그대로 둬도 문제없다). 폭 34px 스트립에 가로 헤더를 그대로
   * 두면 spacer 뒤 버튼들이 스트립 밖으로 overflow:hidden 클리핑되어 마우스로
   * 클릭할 수 없어진다(M1-U2) — 그 대신 라벨/배지/최대화 버튼을 숨기고 grab +
   * 복원(⌃) 버튼만 세로로 쌓는 레일 레이아웃으로 렌더한다.
   */
  collapsedRail?: boolean;
}

/**
 * 모든 도킹 패널이 공유하는 헤더(App Shell.dc.html L88-95 패턴):
 * grab dots → 라벨/탭 → 메타 배지 → (spacer) → 최대화(⤢) → 접기(⌄).
 * 접기/최대화는 layoutStore가 단일 출처 — 패널 자체는 언마운트되지 않는다
 * (WebGL 컨텍스트/CodeMirror 인스턴스 보존은 App.tsx의 슬롯 클래스가 담당).
 *
 * (v1.4 R12) 향후 도킹 헤더에 붙는 패널 dot 5색(accent/source/value/resource/
 * vector)은 **장식적 패널 식별자**일 뿐 — 노드 카테고리/포트 타입 의미축과
 * 무관(예: Code 보라 dot ≠ resource 포트 보라). 신규 토큰 없이 기존 값
 * 재사용. design/README.md §M · design/CHANGELOG.md §v1.4 R12.
 */
export function DockPanelHeader({
  panelId,
  label,
  meta,
  metaAlign = "start",
  children,
  collapsedRail = false,
}: DockPanelHeaderProps) {
  const collapsed = useLayoutStore((s) => s.collapsed[panelId]);
  const isMaximized = useLayoutStore((s) => s.maximized === panelId);
  const toggleCollapsed = useLayoutStore((s) => s.toggleCollapsed);
  const toggleMaximized = useLayoutStore((s) => s.toggleMaximized);

  const isRail = collapsedRail && collapsed;

  return (
    <div className={isRail ? "dock-header dock-header--rail" : "dock-header"}>
      <span className="dock-header-grab" aria-hidden="true">
        ⣿
      </span>
      {!isRail && label !== undefined && (
        <span className="dock-header-label">{label}</span>
      )}
      {!isRail && meta !== undefined && metaAlign === "start" && (
        <span className="dock-header-meta">{meta}</span>
      )}
      {!isRail && children}
      <div className="dock-header-spacer" />
      {!isRail && meta !== undefined && metaAlign === "end" && (
        <span className="dock-header-meta">{meta}</span>
      )}
      {!isRail && (
        <button
          type="button"
          className="dock-header-btn"
          onClick={() => toggleMaximized(panelId)}
          aria-label={isMaximized ? "Restore panel" : "Maximize panel"}
        >
          ⤢
        </button>
      )}
      <button
        type="button"
        className="dock-header-btn"
        onClick={() => toggleCollapsed(panelId)}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        aria-expanded={!collapsed}
      >
        {collapsed ? "⌃" : "⌄"}
      </button>
    </div>
  );
}
