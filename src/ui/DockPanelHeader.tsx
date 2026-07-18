import type { ReactNode } from "react";
import { useDockStore } from "../state/dockStore";
import { type DockPanelId, getNodeAt } from "../state/dockTree";
import { useDockDragStart } from "./dockDragContext";
import { collapsesToRail, PANEL_DOTS, PANEL_TITLES } from "./dockLayoutModel";
import { useDockLeaf } from "./dockLeafContext";

export interface DockPanelHeaderProps {
  /** mono 메타 배지(예: "5N · 4E", "GLSL · ES 3.0"). */
  meta?: string;
  /**
   * 메타 배지 위치 [D13]: 기본 "start"는 탭/children 옆(좌측) — 기존
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
  /** 탭 버튼 등 헤더 중앙에 끼워 넣을 슬롯(dock 탭 뒤에 이어진다). CodeEditor의
   * stage 탭(Vertex/Fragment)이 이 슬롯을 쓴다. */
  children?: ReactNode;
  /** 탭별 카운트 배지(예: Assets 에셋 수). 항목이 없거나 0 이하면 그 탭엔
   * 배지를 렌더하지 않는다. */
  badges?: Partial<Record<DockPanelId, number>>;
}

/**
 * 모든 도킹 패널이 공유하는 헤더(v1.4 `Docking Prototype.dc.html` L84-99
 * 정본): grab dots → dock 탭(leaf.tabs, B3-U2) → 메타 배지 → (spacer) →
 * 접기(⌄/⌃) → 최대화(⤢/⤡) → 패널 닫기(✕). ⚠ `App Shell.dc.html` L88-95는
 * 순서가 다르다(최대화 → 접기, 닫기 없음) — CHANGELOG §v1.4가 헤더 크롬의
 * 정본을 Docking Prototype으로 승격했으므로(R4/R6) 이 컴포넌트는 그쪽을
 * 따른다. 탭/접기/최대화/닫기의 단일 출처는 `dockStore` — 이 leaf의 경로는
 * `useDockLeaf()`(DockLayout이 심어둔 컨텍스트)로 얻는다. 패널 자체는
 * 언마운트되지 않는다(WebGL 컨텍스트/CodeMirror 인스턴스 보존은
 * `DockLayout`/`index.css`의 슬롯 클래스가 담당).
 *
 * (v1.4 R6/R12) 탭은 dock 모델의 `leaf.tabs`를 그대로 렌더한다 — `label`
 * prop은 폐기됐다(탭이 라벨 자리를 대신한다). 탭 자체는 기존 Side Panel
 * 밑줄형 `.panel-tab` idiom을 재사용하고(README §M), 컨테이너(dot/✕)만
 * 신설했다. R5 완료: problems/diagnostics는 도킹 탭이 아니다(상태바 진입
 * 오버레이) — dockTree.DockPanelId 5종(nodeEditor/viewport/code/inspector/
 * assets)이 전부다. `children`(CodeEditor stage 탭)·`badges`(SidePanel
 * assets)는 유지한다.
 */
export function DockPanelHeader({
  meta,
  metaAlign = "start",
  children,
  badges,
}: DockPanelHeaderProps) {
  const { leafId, path } = useDockLeaf();
  // 구조적 공유(`setNodeAt`) 덕에 이 leaf가 바뀌지 않는 갱신에서는 참조가
  // 그대로 유지된다 — 트리 전체가 아니라 이 leaf 하나만 구독해도 안전하다.
  const leaf = useDockStore((s) =>
    s.tree === null ? null : getNodeAt(s.tree, path),
  );
  const collapsed = leaf !== null && leaf.type === "leaf" && leaf.collapsed;
  // '접힘이 폭 스트립인지'는 이 leaf의 직계 부모 split 방향에서 유도한다
  // (B3-U1) — collapsedRail prop 하드코딩 대신 트리를 단일 출처로 삼는다.
  const railCapable = useDockStore((s) =>
    s.tree === null ? false : collapsesToRail(s.tree, path),
  );
  const isMaximized = useDockStore((s) => s.maximized === leafId);
  const setActiveTab = useDockStore((s) => s.setActiveTab);
  const closeTab = useDockStore((s) => s.closeTab);
  const toggleCollapsed = useDockStore((s) => s.toggleCollapsed);
  const toggleMaximized = useDockStore((s) => s.toggleMaximized);
  const closePanel = useDockStore((s) => s.closePanel);

  const isRail = collapsed === true && railCapable;
  const { startLeafDrag, startTabDrag, dragEnabled } = useDockDragStart();

  function selectTab(id: DockPanelId) {
    setActiveTab(path, id);
  }

  return (
    <div className={isRail ? "dock-header dock-header--rail" : "dock-header"}>
      {dragEnabled && (
        <span
          className="dock-header-grab"
          aria-hidden="true"
          // R10/B4-U4: ⣿ grab handle drags the whole leaf (every tab) — dc
          // `grabDown` (Docking Prototype.dc.html L558). `aria-hidden` stays —
          // R10 confirms docking rearrangement is pointer-only (no keyboard
          // alternative needed), so this handler intentionally has no
          // keyboard-reachable equivalent.
          //
          // R11: compact(≤990px) sets dragEnabled:false — the handle is
          // removed from the DOM entirely (not just visually hidden) so a
          // narrow-screen tap can't accidentally arm a drag.
          onPointerDown={(e) => startLeafDrag(path, e)}
        >
          ⣿
        </span>
      )}
      {!isRail && leaf !== null && leaf.type === "leaf" && (
        <div
          // R8: dc L557 tabMask 정본 — leaf.tabs(dock 탭) 개수만 센다. 이
          // 컨테이너 안쪽은 dock 탭뿐이다(R5 완료: problems/diagnostics는
          // 도킹 탭이 아니라 상태바 진입 오버레이라 이 카운트/마스크
          // 대상이 아니다).
          className={
            leaf.tabs.length > 3
              ? "dock-header-tabs dock-header-tabs--masked"
              : "dock-header-tabs"
          }
          role="tablist"
        >
          {leaf.tabs.map((id) => {
            const active = id === leaf.active;
            const badgeCount = badges?.[id] ?? 0;
            return (
              <div
                key={id}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                data-testid={`tab-${id}`}
                className={active ? "panel-tab panel-tab--active" : "panel-tab"}
                onClick={() => selectTab(id)}
                // B4-U4: this tab alone detaches and drags — dc `down`
                // (Docking Prototype.dc.html L544, `startTabDrag({mode:"tab"
                // ,...})`). The tab ✕'s own onPointerDown (below) calls
                // stopPropagation, so it never reaches this handler.
                onPointerDown={(e) => startTabDrag(id, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectTab(id);
                  }
                }}
              >
                <span
                  className="panel-tab-dot"
                  style={{ background: PANEL_DOTS[id] }}
                  aria-hidden="true"
                />
                {PANEL_TITLES[id]}
                {badgeCount > 0 && (
                  <span className="panel-tab-badge">{badgeCount}</span>
                )}
                <button
                  type="button"
                  className="panel-tab-close"
                  aria-label={`Close ${PANEL_TITLES[id]} tab`}
                  // dc t.xDown(Docking Prototype.dc.html L546) 이식 — B4
                  // 드래그 시작(pointerdown)이 ✕까지 먹지 않도록 여기서
                  // 끊는다(탭 선택 onClick과는 별개로 지금 넣는다).
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(id);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!isRail && meta !== undefined && metaAlign === "start" && (
        <span className="dock-header-meta">{meta}</span>
      )}
      {!isRail && children}
      <div className="dock-header-spacer" />
      {!isRail && meta !== undefined && metaAlign === "end" && (
        <span className="dock-header-meta">{meta}</span>
      )}
      <button
        type="button"
        className="dock-header-btn"
        onClick={() => toggleCollapsed(path)}
        aria-label={collapsed === true ? "Expand panel" : "Collapse panel"}
        aria-expanded={collapsed !== true}
      >
        {collapsed === true ? "⌃" : "⌄"}
      </button>
      {!isRail && (
        <button
          type="button"
          className="dock-header-btn"
          onClick={() => toggleMaximized(leafId)}
          aria-label={isMaximized ? "Restore panel" : "Maximize panel"}
        >
          {isMaximized ? "⤡" : "⤢"}
        </button>
      )}
      {!isRail && (
        <button
          type="button"
          className="dock-header-btn dock-header-btn--close"
          onClick={() => closePanel(path)}
          aria-label="Close panel"
        >
          ✕
        </button>
      )}
    </div>
  );
}
