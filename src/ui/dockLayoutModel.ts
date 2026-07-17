/**
 * 도킹 레이아웃 순수 파생 함수 — B2-U1. `DockLayout.tsx`(재귀 flex 렌더러)와
 * `DockPanelHeader.tsx`가 소비한다. React 비의존 — 이 파일이 커버리지
 * 확보처(순수 함수 전수 테스트는 `dockLayoutModel.test.ts`).
 *
 * import는 `../state/dockTree`의 타입 + `COLLAPSED_STRIP_PX`만. raw hex/토큰
 * 직접 사용 없음(이 파일은 클래스명/flex 문자열/라벨만 다룬다).
 */

import {
  COLLAPSED_STRIP_PX,
  type DockLeaf,
  type DockPanelId,
  type DockSplit,
} from "../state/dockTree";

/** leaf가 어떤 레거시 슬롯(App.tsx 하드코딩 4패널) 역할을 하는지. B2에서는
 * SidePanel 컴포넌트 하나가 inspector/assets 두 탭을 함께 담당하므로 둘 다
 * "sidePanel"로 매핑된다. */
export type LeafPanelKind =
  | "nodeEditor"
  | "viewport"
  | "sidePanel"
  | "code"
  | null;

/** leaf가 렌더할 패널 컴포넌트 종류를 판정한다. `tabs`에 "inspector" 또는
 * "assets"가 하나라도 있으면 무조건 "sidePanel"(B2: 두 탭을 한 컴포넌트가
 * 담당) — 그 외에는 `tabs[0]` 기준으로 매핑한다. `tabs`가 빈 배열이면
 * `tabs[0]`이 `undefined`이므로(noUncheckedIndexedAccess) `null`을 반환한다. */
export function leafPanelKind(leaf: DockLeaf): LeafPanelKind {
  if (leaf.tabs.includes("inspector") || leaf.tabs.includes("assets")) {
    return "sidePanel";
  }
  const first = leaf.tabs[0];
  if (first === "nodeEditor") return "nodeEditor";
  if (first === "viewport") return "viewport";
  if (first === "code") return "code";
  return null;
}

/** leaf의 레거시(현행 App.tsx 하드코딩) 셀렉터 클래스명.
 * ⚠ E2E 셀렉터 계약: `tests/e2e/m1-dock-header-collapse.spec.ts`가
 * `.shell-left`를 직접 조회한다 — 이 매핑을 깨면 그 스펙이 회귀한다. */
export function legacyLeafClass(leaf: DockLeaf): string | null {
  const kind = leafPanelKind(leaf);
  if (kind === "nodeEditor") return "shell-left";
  if (kind === "viewport") return "shell-right-top";
  if (kind === "sidePanel") return "shell-right-bottom";
  if (kind === "code") return "shell-code";
  return null;
}

export interface SplitChildFlex {
  a: string;
  b: string;
  showDivider: boolean;
}

/** split 노드의 두 자식에게 줄 flex 문자열 + divider 렌더 여부. dc `_layout`
 * (L308-309)의 접힘 판정과 동일: `aCol`/`bCol`은 **직계 자식**이 leaf이고
 * `collapsed === true`일 때만 참(조상/자손의 collapsed는 무관).
 *
 * - 한쪽만 접힘 → 접힌 쪽은 `COLLAPSED_STRIP_PX` 고정 strip, 반대쪽이 나머지
 *   전부(`1 - ratio` 아님 — flex-grow 1이 나머지 공간을 전부 채움).
 * - 그 외(양쪽 정상 또는 양쪽 접힘 — 인위적 케이스, dc 정본대로 가드 없음)
 *   → `ratio` 기반 두 flex.
 * - `showDivider = !(aCol || bCol)` — **R4 정본**: 접힌 leaf가 하나라도
 *   있으면 그 split의 divider는 렌더되지 않는다(접힌 34px strip은 드래그로
 *   리사이즈할 수 없다는 의미). 현행 App.tsx는 접힘 중에도 스플리터를
 *   남겼지만 R4가 이를 갱신한다 — E2E는 이 동작을 단언하지 않음(확인 완료,
 *   `m1-dock-header-collapse.spec.ts`는 shell-left 폭/버튼 도달성만 본다). */
export function splitChildFlex(split: DockSplit): SplitChildFlex {
  const aCol = split.a.type === "leaf" && split.a.collapsed === true;
  const bCol = split.b.type === "leaf" && split.b.collapsed === true;
  if (aCol && !bCol) {
    return {
      a: `0 0 ${COLLAPSED_STRIP_PX}px`,
      b: `${1 - split.ratio} 1 0px`,
      showDivider: false,
    };
  }
  if (bCol && !aCol) {
    return {
      a: `${split.ratio} 1 0px`,
      b: `0 0 ${COLLAPSED_STRIP_PX}px`,
      showDivider: false,
    };
  }
  return {
    a: `${split.ratio} 1 0px`,
    b: `${1 - split.ratio} 1 0px`,
    showDivider: !(aCol || bCol),
  };
}

/** dc `META`(L265-271)의 title 필드 이식 — 도킹 가능한 5종 패널의 표시명.
 * 접근성 라벨(`splitterLabel`)이 파생 출처로 쓴다. */
export const PANEL_TITLES: Record<DockPanelId, string> = {
  nodeEditor: "Node Editor",
  viewport: "Viewport",
  inspector: "Inspector",
  code: "Code",
  assets: "Assets",
};

/** leaf/split 서브트리를 사람이 읽을 라벨로 요약한다(재귀). leaf는 탭을
 * `PANEL_TITLES` 기준 " / "로 병기(sidePanel leaf처럼 탭이 여럿이면 전부
 * 나열), split은 두 자식의 라벨을 " and "로 잇는다. */
function describeNode(node: DockLeaf | DockSplit): string {
  if (node.type === "leaf") {
    return node.tabs.map((id) => PANEL_TITLES[id]).join(" / ");
  }
  return `${describeNode(node.a)} and ${describeNode(node.b)}`;
}

/** 스플리터의 접근성 라벨을 자동 파생한다 — `Resize {a 라벨} and {b 라벨}`. */
export function splitterLabel(split: DockSplit): string {
  return `Resize ${describeNode(split.a)} and ${describeNode(split.b)}`;
}
