import type { ReactNode } from "react";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useDockDragStart } from "./dockDragContext";
import {
  collapseChevron,
  collapsesToRail,
  PANEL_DOTS,
  PANEL_TITLES,
} from "./dockLayoutModel";
import { useDockLeaf } from "./dockLeafContext";
import { useDockStore } from "./dockStore";
import { type DockPanelId, getNodeAt } from "./tree";

export interface DockPanelHeaderProps {
  /** mono 메타 배지(예: "5N · 4E", "GLSL · ES 3.0"). */
  meta?: string;
  /**
   * 메타 배지 위치: 기본 "start"는 탭/children 옆(좌측) — Node Editor
   * "5N · 4E", Viewport가 쓴다. "end"는 spacer 뒤(접기 버튼 앞) 우측 정렬 —
   * Code Editor 정본 순서. 두 경우 모두 배경+보더 배지 박스로 그린다(plain
   * mono 변형 없음 — 공통 컴포넌트 일관성 우선). 정본: design/README.md
   * "도킹 헤더 메타 배지 정렬".
   */
  metaAlign?: "start" | "end";
  /** 탭 버튼 등 헤더 중앙에 끼워 넣을 슬롯(dock 탭 뒤에 이어진다). 현재
   * 실제 소비자는 없다 — CodeEditor의 stage 탭은 25% 폭 컬럼에서 헤더가
   * 오버플로하지 않도록 본문 상단 `.code-stage-strip`에 둔다. 컴포넌트
   * 계약 자체는 범용으로 남겨두고 DockPanelHeader.test.tsx가 독립적으로
   * 커버한다. */
  children?: ReactNode;
  /** 탭별 카운트 배지(예: Assets 에셋 수). 항목이 없거나 0 이하면 그 탭엔
   * 배지를 렌더하지 않는다. */
  badges?: Partial<Record<DockPanelId, number>>;
}

/**
 * 모든 도킹 패널이 공유하는 헤더(정본: `App Shell.dc.html` 도킹 패널
 * 헤더): grab dots → dock 탭(leaf.tabs) → 메타 배지 → (spacer) →
 * 접기(⌄/⌃) → 최대화(⤢/⤡) → 패널 닫기(✕). 탭/접기/최대화/닫기의 단일
 * 출처는 `dockStore` — 이 leaf의 경로는
 * `useDockLeaf()`(DockLayout이 심어둔 컨텍스트)로 얻는다. 패널 자체는
 * 언마운트되지 않는다(WebGL 컨텍스트/CodeMirror 인스턴스 보존은
 * `DockLayout`/`src/styles/20-dock-shell.css`의 슬롯 클래스가 담당).
 *
 * 탭은 dock 모델의 `leaf.tabs`를 그대로 렌더한다(탭이 라벨 자리를
 * 대신한다). 탭 자체는 Side Panel 밑줄형 `.panel-tab` idiom을 재사용하고
 * (design/README.md §M), 컨테이너(dot/✕)만 더했다. problems/diagnostics는
 * 도킹 탭이 아니다(상태바 진입 오버레이) — `tree.ts`의 DockPanelId 5종이
 * 전부다.
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
  // — 패널별 prop 하드코딩 대신 트리를 단일 출처로 삼는다.
  const railCapable = useDockStore((s) =>
    s.tree === null ? false : collapsesToRail(s.tree, path),
  );
  // The collapse chevron's direction is position-based (parent split
  // dir + a/b side), not tied to panel kind — `collapseChevron` re-derives
  // it from the tree on every render, so re-docking a panel automatically
  // flips the glyph. Returns a primitive `string`, so (like `railCapable`
  // above) there's no reference-identity over-render risk from this
  // selector.
  const chevron = useDockStore((s) => {
    if (s.tree === null) return collapseChevron(null, path, false);
    const n = getNodeAt(s.tree, path);
    const leafCollapsed =
      n !== null && n.type === "leaf" && n.collapsed === true;
    return collapseChevron(s.tree, path, leafCollapsed);
  });
  const isMaximized = useDockStore((s) => s.maximized === leafId);
  const setActiveTab = useDockStore((s) => s.setActiveTab);
  const closeTab = useDockStore((s) => s.closeTab);
  const toggleCollapsed = useDockStore((s) => s.toggleCollapsed);
  const toggleMaximized = useDockStore((s) => s.toggleMaximized);
  const closePanel = useDockStore((s) => s.closePanel);

  const isRail = collapsed === true && railCapable;
  const isCodeRail =
    isRail && leaf !== null && leaf.type === "leaf" && leaf.active === "code";
  // 접힌 code 레일의 에러 dot을 "Code 에디터가 현재 연 셰이더 노드"로
  // 스코프한다 — 그래프 전체 합산이 아니라, 그 패널이 지금 보여주는 셰이더의
  // 에러만(design/README.md §M). 열린 노드 = selectedNodeId ?? 첫 shader,
  // 단 shader/compute일 때만(CodeEditor/index.tsx effectiveId 미러). 비-shader
  // 선택으로 접힌 상태면 열린 셰이더가 없어 0. dc `railErr`(App Shell.dc.html).
  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId);
  const openCodeNodeId = useGraphStore((s) => {
    const first = s.nodes.find((n) => n.kind === "shader")?.id ?? null;
    const id = selectedNodeId ?? first;
    if (id === null) return null;
    const n = s.nodes.find((x) => x.id === id);
    return n !== undefined && (n.kind === "shader" || n.kind === "compute")
      ? id
      : null;
  });
  // primitive number 반환이라 참조 동일성 오버렌더 없음. code 레일이 아니거나
  // 열린 셰이더가 없으면 조기 0 반환으로 순회 생략.
  const railErrorCount = useDiagnosticsStore((s) => {
    if (!isCodeRail || openCodeNodeId === null) return 0;
    const d = s.byNode[openCodeNodeId];
    if (d === undefined) return 0;
    let n = 0;
    for (const arr of [d.vertex, d.fragment, d.link]) {
      for (const x of arr) if (x.severity === "error") n++;
    }
    return n;
  });
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
          // ⣿ grab handle drags the whole leaf (every tab) — design/App
          // Shell.dc.html `grabDown`. `aria-hidden` stays: docking
          // rearrangement is pointer-only by design (design/CHANGELOG.md),
          // so this handler intentionally has no keyboard equivalent.
          //
          // compact(≤990px) sets dragEnabled:false — the handle is
          // removed from the DOM entirely (not just visually hidden) so a
          // narrow-screen tap can't accidentally arm a drag.
          onPointerDown={(e) => startLeafDrag(path, e)}
        >
          ⣿
        </span>
      )}
      {/* 레일 인테리어(정본: App Shell.dc.html 접힌 패널 레일): 패널 dot +
          세로 라벨(제목 · 메타) + (code 컴파일 에러 시) 에러 dot. 접힘
          메커니즘(34px 폭·부모 dir 파생·divider 비활성)은 건드리지 않는다.
          범용 규칙: 모든 rail-collapsed leaf가 dot+라벨을 얻고, 에러 dot은
          code leaf만(design/README.md §M). */}
      {isRail && leaf !== null && leaf.type === "leaf" && (
        <>
          <span
            className="panel-tab-dot"
            style={{ background: PANEL_DOTS[leaf.active] }}
            aria-hidden="true"
          />
          <div className="dock-rail-label" data-testid="dock-rail-label">
            {meta !== undefined
              ? `${PANEL_TITLES[leaf.active]} · ${meta}`
              : PANEL_TITLES[leaf.active]}
          </div>
          {railErrorCount > 0 && (
            <span
              className="dock-rail-error-dot"
              data-testid="dock-rail-error-dot"
              title={
                railErrorCount === 1
                  ? "1 compile error"
                  : `${railErrorCount} compile errors`
              }
              // 에러 수는 StatusBar 문제 카운트가 이미 스크린리더에 노출한다 —
              // 이 dot은 시각적 중복 표시라 aria-hidden (dc title="1 error" 대응).
              aria-hidden="true"
            />
          )}
        </>
      )}
      {!isRail && leaf !== null && leaf.type === "leaf" && (
        <div
          // dc `tabMask` 정본 — leaf.tabs(dock 탭) 개수만 센다. 이 컨테이너
          // 안쪽은 dock 탭뿐이다(problems/diagnostics는 도킹 탭이 아니라
          // 상태바 진입 오버레이라 이 카운트/마스크 대상이 아니다).
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
                // This tab alone detaches and drags — dc `down` →
                // `startTabDrag({mode:"tab",...})`. The tab ✕'s own
                // onPointerDown (below) calls stopPropagation, so it never
                // reaches this handler.
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
                  // dc `t.xDown` 이식 — 탭 드래그 시작(pointerdown)이 ✕까지
                  // 먹지 않도록 여기서 끊는다(탭 선택 onClick과는 별개).
                  onPointerDown={(e) => e.stopPropagation()}
                  // 탭 ✕는 키보드로 도달
                  // 가능해야 한다. 부모 탭의 onKeyDown이 Enter/Space에
                  // preventDefault를 걸어 이 버튼의 네이티브 활성화(그리고
                  // 뒤따르는 click)를 삼키므로, 활성화 키에 한해 전파를
                  // 끊는다. 통짜 stopPropagation은 금물 — React가 루트
                  // 컨테이너에서 네이티브 전파까지 끊어 window 리스너
                  // (Cmd+Z/D/A·화살표 nudge)가 죽는다.
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
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
      {!isRail && <div className="dock-header-spacer" />}
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
        {chevron}
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
