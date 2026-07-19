/**
 * 도킹 레이아웃 순수 파생 함수 — B2-U1(+B3-U1 `collapsesToRail`).
 * `DockLayout.tsx`(재귀 flex 렌더러)와 `DockPanelHeader.tsx`가 소비한다.
 * React 비의존 — 이 파일이 커버리지 확보처(순수 함수 전수 테스트는
 * `dockLayoutModel.test.ts`).
 *
 * import는 `../state/dockTree`의 타입 + `COLLAPSED_STRIP_PX`/`getNodeAt`만.
 * raw hex/토큰 직접 사용 없음(이 파일은 클래스명/flex 문자열/라벨만 다룬다).
 */

import {
  COLLAPSED_STRIP_PX,
  type DockLeaf,
  type DockNode,
  type DockPanelId,
  type DockPath,
  type DockSplit,
  getNodeAt,
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

/** leaf가 렌더할 패널 컴포넌트 종류를 판정한다(S5, v2.0 — 이전엔
 * `tabs[0]` 기준이었다). **`leaf.active` 기준**으로 판정하므로, 이종 탭을
 * 가진 leaf(예: `tabs:["nodeEditor","assets"]`)에서 active가 전환되면
 * kind도 함께 전환된다 — 진짜 도킹 UX(본문·`legacyLeafClass`가 탭 선택에
 * 따라 실제로 바뀐다). `tabs`가 빈 배열이면(방어적 케이스) `active`가 그
 * leaf의 실제 탭이 아니므로 이 스위치로 판정할 근거가 없다 — `null`.
 *
 * exhaustive switch — `DockPanelId`는 닫힌 5종 유니온이라 `default` 없이도
 * (noFallthroughCasesInSwitch 하에서) 전수 커버된다. */
export function leafPanelKind(leaf: DockLeaf): LeafPanelKind {
  if (leaf.tabs.length === 0) return null;
  switch (leaf.active) {
    case "nodeEditor":
      return "nodeEditor";
    case "viewport":
      return "viewport";
    case "inspector":
    case "assets":
      return "sidePanel";
    case "code":
      return "code";
  }
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
      b: "1 1 0px",
      showDivider: false,
    };
  }
  if (bCol && !aCol) {
    return {
      a: "1 1 0px",
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

/** 접힌 leaf가 '폭 34px 스트립'으로 접히는지(= 세로 레일 헤더가 필요한지).
 * 직계 부모 split의 `dir`가 `"row"`면 leaf는 가로로 나란히 놓여 있으므로
 * 접힘은 **폭** 방향(strip)이 된다 — 반대로 부모가 `"col"`이면 접힘은
 * **높이** 방향이라 가로 헤더 그대로 둬도 문제없다.
 *
 * 이전에는 각 패널이 `collapsedRail` prop으로 이를 하드코딩했다(M1-U2 당시엔
 * shell-left/Node Editor뿐이었으므로). 하지만 트리 모델에서는 임의의 leaf가
 * row split 아래로 이동할 수 있으므로(B4 드래그 재도킹) prop 하드코딩은
 * 트리 형태가 바뀌면 어긋난다 — 이 함수가 트리에서 직접 유도한다(B3-U1).
 *
 * 루트 leaf(`path=[]`, 부모가 없음)·`null` 트리·leaf 아래로 더 내려가는
 * 잘못된 경로는 전부 `false`. */
export function collapsesToRail(
  tree: DockNode | null,
  path: DockPath,
): boolean {
  if (tree === null || path.length === 0) return false;
  const parent = getNodeAt(tree, path.slice(0, -1));
  return parent !== null && parent.type === "split" && parent.dir === "row";
}

/** dc `_buildPanel`'s `collapseIcon` (App Shell.dc.html L800-801, 821-823,
 * req1) — the collapse chevron's *direction* is decided by the leaf's
 * **position** (parent split `dir` + which side — `a`/`b` — it is), not by
 * which panel kind it renders. Moving a panel to a new dock position
 * re-derives a new chevron automatically (design/CHANGELOG.md §v2.0 req1 ·
 * design/README.md §M R4).
 *
 * dc's 8-combination table, `open`/`collapsed` glyphs (U+2039 `‹`, U+203A
 * `›`, U+2303 `⌃`, U+2304 `⌄`):
 * - row + a: `‹` / `›`
 * - row + b: `›` / `‹`
 * - col + a (top):    `⌃` / `⌄`
 * - col + b (bottom): `⌄` / `⌃`
 *
 * dc derives `parentDir`/`childSide` with `r.path.length ? … : ("row", "a")`
 * (L800-801) — a root-leaf-only tree (`path.length === 0`), a `null` tree,
 * or an invalid path (parent lookup misses) all fall back to that same
 * default: `parentDir = "row"`, `childSide = "a"` (the row-a rule). */
export function collapseChevron(
  tree: DockNode | null,
  path: DockPath,
  collapsed: boolean,
): string {
  let parentDir: DockSplit["dir"] = "row";
  let childSide: "a" | "b" = "a";
  if (tree !== null && path.length > 0) {
    const parent = getNodeAt(tree, path.slice(0, -1));
    const lastStep = path[path.length - 1];
    if (parent !== null && parent.type === "split" && lastStep !== undefined) {
      parentDir = parent.dir;
      childSide = lastStep;
    }
  }
  if (parentDir === "row") {
    if (childSide === "a") return collapsed ? "›" : "‹";
    return collapsed ? "‹" : "›";
  }
  if (childSide === "a") return collapsed ? "⌄" : "⌃";
  return collapsed ? "⌃" : "⌄";
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

// ============================================================
// 드래그 고스트 크기/오프셋 (B4-U3)
// 정본: `design/Docking Prototype.dc.html` `onMove`의 `pending` 분기
// (L392-409).
// ============================================================

/** dc L399 — leaf 모드 고스트 폭/높이의 region 대비 비율. */
const LEAF_GHOST_FRAC = 0.92;
/** dc L399 — leaf 모드 고스트 폭 하한(px). */
const LEAF_GHOST_MIN_W = 320;
/** dc L399 — leaf 모드 고스트 폭 상한(px). */
const LEAF_GHOST_MAX_W = 540;
/** dc L400 — leaf 모드 고스트 높이 하한(px). */
const LEAF_GHOST_MIN_H = 220;
/** dc L400 — leaf 모드 고스트 높이 상한(px). */
const LEAF_GHOST_MAX_H = 440;
/** dc L399-400 — source region을 못 찾았을 때(방어적 케이스) leaf 모드
 * 고스트 폴백 크기. */
const LEAF_GHOST_FALLBACK = { w: 400, h: 300 };

/** dc L405 — tab 모드 고스트 폭/높이의 region 대비 비율. */
const TAB_GHOST_FRAC = 0.85;
/** dc L405 — tab 모드 고스트 폭 하한(px). */
const TAB_GHOST_MIN_W = 300;
/** dc L405 — tab 모드 고스트 폭 상한(px). */
const TAB_GHOST_MAX_W = 460;
/** dc L406 — tab 모드 고스트 높이 하한(px). */
const TAB_GHOST_MIN_H = 200;
/** dc L406 — tab 모드 고스트 높이 상한(px). */
const TAB_GHOST_MAX_H = 360;
/** dc L405-406 — source region을 못 찾았을 때(방어적 케이스) tab 모드
 * 고스트 폴백 크기. */
const TAB_GHOST_FALLBACK = { w: 380, h: 260 };

/**
 * 드래그 중인 leaf/tab 고스트의 폭·높이를 계산한다. dc `onMove`의 `pending`
 * 분기 클램프(L398-406) 이식 — leaf는 소스 region의 92%(320~540 ×
 * 220~440 클램프), tab은 85%(300~460 × 200~360 클램프). `region`이 `null`
 * (드래그 시작 시점에 소스 region을 못 찾은 방어적 케이스)이면 각 모드의
 * 고정 폴백 크기를 반환한다.
 */
export function ghostSize(
  mode: "leaf" | "tab",
  region: { w: number; h: number } | null,
): { w: number; h: number } {
  if (mode === "leaf") {
    if (region === null) return LEAF_GHOST_FALLBACK;
    return {
      w: Math.min(
        LEAF_GHOST_MAX_W,
        Math.max(LEAF_GHOST_MIN_W, region.w * LEAF_GHOST_FRAC),
      ),
      h: Math.min(
        LEAF_GHOST_MAX_H,
        Math.max(LEAF_GHOST_MIN_H, region.h * LEAF_GHOST_FRAC),
      ),
    };
  }
  if (region === null) return TAB_GHOST_FALLBACK;
  return {
    w: Math.min(
      TAB_GHOST_MAX_W,
      Math.max(TAB_GHOST_MIN_W, region.w * TAB_GHOST_FRAC),
    ),
    h: Math.min(
      TAB_GHOST_MAX_H,
      Math.max(TAB_GHOST_MIN_H, region.h * TAB_GHOST_FRAC),
    ),
  };
}

/** dc `onMove`의 `ghost.x = p.x - 70; ghost.y = p.y - 15;`(L408-409) — 고스트가
 * 커서 기준 좌상단으로 붙는 고정 오프셋(px). */
export const GHOST_POINTER_OFFSET = { x: 70, y: 15 } as const;

// ============================================================
// 패널 dot (R12 — DockPanelHeader.tsx에서 이동, B4-U3)
// ============================================================

/** 패널 dot 5색 — **장식적 패널 식별자**일 뿐, 노드 카테고리/포트 타입
 * 의미축과 무관하다(예: Code 보라 dot ≠ resource 포트 보라). 신규 토큰 0 —
 * 기존 CSS 변수를 재사용한다. dc META(Docking Prototype.dc.html L265-271):
 * #3d9bff=accent.default · #4bbf89=nodeCategory.source · #d4a53c=
 * nodeCategory.value · #a06bff=portFamily.resource · #f0b429=portFamily.vector.
 * design/CHANGELOG.md §v1.4 R12 · design/README.md §M.
 *
 * `DockPanelHeader`(탭 dot)와 드래그 고스트 헤더(`DockLayout.tsx`가 렌더,
 * B4-U3) 양쪽이 이 상수 하나를 공유한다 — 원래 `DockPanelHeader.tsx`의
 * 모듈-프라이빗 상수였으나, 고스트 쪽도 필요해져 두 소비자의 공유 출처인
 * 이 파일(`dockLayoutModel.ts`)로 이동했다. */
export const PANEL_DOTS: Record<DockPanelId, string> = {
  nodeEditor: "var(--accent-default)",
  viewport: "var(--node-cat-source)",
  inspector: "var(--node-cat-value)",
  code: "var(--port-resource)",
  assets: "var(--port-vector)",
};
