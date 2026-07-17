/**
 * 도킹 트리 — 순수 데이터 모델(React/zustand 의존 없음, JSON 직렬화 가능).
 *
 * 정본 출처: `design/Docking Prototype.dc.html`(v1.4) + `design/CHANGELOG.md`
 * §v1.4 R1·R2·R3·R4·R7. 이 파일은 dc의 `_defaultTree()` / `_getAt` / `_setAt` /
 * `_collect` / `MIN_W`·`MIN_H`를 순수 TS로 이식한 B1-1 산출물(+ B1-3에서
 * `_layout`/divider 클램프 이식 추가, + B4-U1에서 `computeDrop`/
 * `_fallbackTarget`/`dockGhost`/`_samePath` 이식 추가)이다.
 * 이전의 고정 4분할 레이아웃 스토어는 B2에서 이 트리 모델로 교체 완료·삭제됨
 * — 마지막 소비자였던 StatusBar가 B2-U2에서 `dockStore`/`findTabLeafPath`
 * 경유로 이관되었다.
 *
 * ⚠ 결함 정정: dc `_defaultTree()`(L276-290)는 가운데 split(viewport ↔
 * inspector/assets)을 `dir:"row"`로 정의하지만, 이는 **정본 결함**이다.
 * R2("App Shell = 기본 레이아웃 정본") 타이브레이크에 따라 아래
 * `createDefaultDockTree()`는 `dir:"col"`로 구현한다. 근거:
 *   - 0.556 = 1.25/2.25 = 이전 고정 레이아웃 스토어의 뷰포트:사이드패널
 *     **높이** 비율.
 *   - `src/index.css` `.shell-right { flex-direction: column }`.
 *   - `design/App Shell.dc.html` L208 `flex-direction:column`(RIGHT COLUMN).
 * 즉 viewport/inspector는 세로로 쌓이는 관계이며, 가로(row)로 나란히
 * 두는 dc 표기는 오타다. `temp/design-followup-v1.4.md` §2-1에 기록됨 —
 * 미래에 이 파일을 dc와 대조하다가 "row로 고쳐야 하나?" 싶어진다면 그
 * 문서와 위 근거부터 먼저 확인할 것. dc의 다른 부분(`_getAt`/`_setAt`/
 * `_collect` 등)은 결함이 아니므로 그대로 이식한다.
 */

/** 도킹 가능한 5종 패널. R5: problems/diagnostics는 포함하지 않는다 —
 * diagnostics는 `debugUiStore.open` 단일 출처를 유지하며 도킹 탭이
 * 아니다(B5에서 하단 트랜지언트 오버레이로 별도 처리). */
export type DockPanelId =
  | "nodeEditor"
  | "viewport"
  | "inspector"
  | "code"
  | "assets";

/** 트리 루트에서 특정 노드까지의 경로. 각 스텝은 split의 a/b 분기. */
export type DockPath = ("a" | "b")[];

export interface DockLeaf {
  type: "leaf";
  id: string;
  tabs: DockPanelId[];
  active: DockPanelId;
  collapsed?: boolean;
}

export interface DockSplit {
  type: "split";
  dir: "row" | "col";
  ratio: number;
  a: DockNode;
  b: DockNode;
}

export type DockNode = DockLeaf | DockSplit;

/** dc `ALL`(L272) — 도킹 가능한 전체 패널 id 목록. */
export const DOCK_PANEL_IDS: readonly DockPanelId[] = [
  "nodeEditor",
  "viewport",
  "inspector",
  "code",
  "assets",
];

/** dc `_layout`의 `const D = 6`(L307) — divider(스플리터 바) 두께(px). */
export const DIVIDER_PX = 6;

/** dc `COLLAPSED`(L264) — 접힌 leaf의 split 방향 고정 strip 두께(px, R4). */
export const COLLAPSED_STRIP_PX = 34;

/** dc `MIN_W`/`MIN_H`(L263) — 전역 leaf 최소 크기(px, R7). */
export const MIN_LEAF_WIDTH = 240;
export const MIN_LEAF_HEIGHT = 160;

/**
 * 기본 도킹 트리 — App Shell 첫 화면과 동치(R2/R3): 좌측 Node Editor,
 * 우측 상단 Viewport, 우측 하단 Inspector/Assets 탭, 하단 전폭 Code 독.
 * dc `_defaultTree()`(L276-290) 이식 — 가운데 split만 `col`로 정정(파일
 * 헤더 결함 정정 주석 참조). 매 호출마다 새 객체를 반환한다(공유 참조 없음).
 */
export function createDefaultDockTree(): DockNode {
  return {
    type: "split",
    dir: "col",
    ratio: 0.717,
    a: {
      type: "split",
      dir: "row",
      ratio: 0.587,
      a: { type: "leaf", id: "l1", tabs: ["nodeEditor"], active: "nodeEditor" },
      b: {
        type: "split",
        dir: "col", // ← dc는 row지만 정본 결함(파일 헤더 주석 참조)
        ratio: 0.556,
        a: { type: "leaf", id: "l2", tabs: ["viewport"], active: "viewport" },
        b: {
          type: "leaf",
          id: "l3",
          tabs: ["inspector", "assets"],
          active: "inspector",
        },
      },
    },
    b: {
      type: "leaf",
      id: "l4",
      tabs: ["code"],
      active: "code",
      collapsed: false,
    },
  };
}

/**
 * 주어진 경로의 노드를 조회한다. dc `_getAt`(L328) 이식 — 재귀 인덱싱 대신
 * 반복문(noUncheckedIndexedAccess 하에서 `node[path[0]]` 형태의 동적
 * 인덱싱을 피하기 위함). 잘못된 경로(leaf 아래로 더 내려가는 경로)는
 * `null`을 반환한다.
 */
export function getNodeAt(node: DockNode, path: DockPath): DockNode | null {
  let cur: DockNode = node;
  for (const step of path) {
    if (cur.type !== "split") return null;
    cur = step === "a" ? cur.a : cur.b;
  }
  return cur;
}

/**
 * 주어진 경로의 노드를 `value`로 치환한 새 트리를 반환한다(불변 갱신,
 * 구조적 공유 — 경로 밖 서브트리는 원본과 동일 참조). dc `_setAt`
 * (L329-332) 이식. 잘못된 경로(leaf 아래로 더 내려가는 경로)는 원본을
 * 그대로 반환한다.
 */
export function setNodeAt(
  node: DockNode,
  path: DockPath,
  value: DockNode,
): DockNode {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (node.type !== "split") return node;
  return head === "a"
    ? { ...node, a: setNodeAt(node.a, rest, value) }
    : { ...node, b: setNodeAt(node.b, rest, value) };
}

/**
 * 트리에 도킹된 전체 패널 id를 in-order(a 우선)로 수집한다. dc `_collect`
 * (L354-358) 이식 — out-param 대신 배열을 반환한다. `null` 입력은 빈
 * 배열을 반환한다.
 */
export function collectPanelIds(node: DockNode | null): DockPanelId[] {
  if (node === null) return [];
  if (node.type === "leaf") return [...node.tabs];
  return [...collectPanelIds(node.a), ...collectPanelIds(node.b)];
}

/**
 * 주어진 leaf id의 경로를 찾는다. dc `_pathOf`(L625-631)의 참조 비교를
 * leaf-id 비교로 바꾼 변형 — leaf이고 `id`가 일치하면 현재 경로, split이면
 * a를 먼저 재귀 탐색 후 b. 없으면 `null`(B1-4의 toggleMaximized/maximized
 * 정리에서 호출).
 */
export function findLeafPath(
  node: DockNode | null,
  leafId: string,
): DockPath | null {
  if (node === null) return null;
  if (node.type === "leaf") return node.id === leafId ? [] : null;
  const inA = findLeafPath(node.a, leafId);
  if (inA !== null) return ["a", ...inA];
  const inB = findLeafPath(node.b, leafId);
  if (inB !== null) return ["b", ...inB];
  return null;
}

/** 주어진 패널 id를 탭으로 가진 첫 leaf(a 우선)의 경로. dc `_findLeaf`
 * (L334-337)의 `tabs.includes` 분기 이식 — leaf id 비교 분기는
 * `findLeafPath`가 담당한다(B2-U2, StatusBar가 호출). */
export function findTabLeafPath(
  node: DockNode | null,
  id: DockPanelId,
): DockPath | null {
  if (node === null) return null;
  if (node.type === "leaf") return node.tabs.includes(id) ? [] : null;
  const inA = findTabLeafPath(node.a, id);
  if (inA !== null) return ["a", ...inA];
  const inB = findTabLeafPath(node.b, id);
  return inB === null ? null : ["b", ...inB];
}

/**
 * in-order(a 우선) 첫 leaf의 경로를 반환한다. dc `addPanel`(L512-523)이
 * `this.dc.regions[0]`(`_layout`이 a-먼저 재귀로 채운 배치 순회 첫
 * region)을 새 탭의 삽입 대상으로 쓰는 것과 동치 — `_layout`도 각 split에서
 * a를 먼저 순회하므로 regions[0]은 항상 in-order 첫 leaf다. `null` 입력은
 * `null`을 반환한다(B1-4 addPanel에서 호출).
 */
export function firstLeafPath(node: DockNode | null): DockPath | null {
  if (node === null) return null;
  if (node.type === "leaf") return [];
  const sub = firstLeafPath(node.a);
  return sub === null ? null : ["a", ...sub];
}

/**
 * 트리에서 `id` 패널을 제거한다. dc `_removePanel`(L339-353) 이식.
 *
 * - leaf에 `id`가 없으면 원본과 동일 참조로 `{ node, found: false }`.
 * - leaf에서 `id`를 제거해 tabs가 비면 leaf 자체가 소멸(`{ node: null,
 *   found: true }`).
 * - 제거된 탭이 active였다면, 폴백 active는 **원본 tabs에서의 인덱스**
 *   기준으로 `newTabs[Math.max(0, node.tabs.indexOf(id) - 1)]`다(인덱스 0의
 *   active를 지우면 새 tabs[0], 그 외엔 왼쪽 이웃) — dc 정본.
 * - split은 a 쪽에서 먼저 재귀 탐색: a에서 발견되면 `a.node`가 null일 때
 *   (a leaf가 소멸) 부모 split 전체가 형제 `b`로 대체되는 트리 축약이
 *   일어난다. 아니면 `{ ...node, a: a.node }`. b 쪽도 대칭으로 처리.
 *   양쪽 다 미발견이면 원본과 동일 참조.
 */
export function removePanel(
  node: DockNode | null,
  id: DockPanelId,
): { node: DockNode | null; found: boolean } {
  if (node === null) return { node: null, found: false };
  if (node.type === "leaf") {
    if (!node.tabs.includes(id)) return { node, found: false };
    const newTabs = node.tabs.filter((t) => t !== id);
    if (newTabs.length === 0) return { node: null, found: true };
    if (node.active !== id) {
      return { node: { ...node, tabs: newTabs }, found: true };
    }
    // newTabs는 위에서 비어있지 않음을 확인했으므로 ?? 는 타입 전용 폴백
    const fallback =
      newTabs[Math.max(0, node.tabs.indexOf(id) - 1)] ?? node.active;
    return { node: { ...node, tabs: newTabs, active: fallback }, found: true };
  }
  const a = removePanel(node.a, id);
  if (a.found) {
    return {
      node: a.node === null ? node.b : { ...node, a: a.node },
      found: true,
    };
  }
  const b = removePanel(node.b, id);
  if (b.found) {
    return {
      node: b.node === null ? node.a : { ...node, b: b.node },
      found: true,
    };
  }
  return { node, found: false };
}

/** 배치된 leaf 하나의 픽셀 영역. dc `regions[]` 원소(L305) 이식 —
 * `node` 필드명은 `leaf`로 개명(다른 곳의 `node: DockNode` 관례와 구분). */
export interface DockRegion {
  leaf: DockLeaf;
  x: number;
  y: number;
  w: number;
  h: number;
  path: DockPath;
}

/** 배치된 divider(스플리터 바) 하나. dc `dividers[]` 원소(L318·L326) 이식.
 * `path`는 이 divider를 소유하는 **split 노드**의 경로(자식 leaf의 경로가
 * 아님). `ratio`/`spanW`/`spanH`는 드래그 시 `clampDividerRatio`에 그대로
 * 넘길 수 있도록 원본 split의 비율/전체 스팬을 보존한다. */
export interface DockDivider {
  dir: "row" | "col";
  x: number;
  y: number;
  w: number;
  h: number;
  path: DockPath;
  ratio: number;
  spanW: number;
  spanH: number;
}

/**
 * 트리를 (0,0)-(width,height) 영역에 재귀 배치해 leaf 영역과 divider 목록을
 * 계산한다. dc `_layout`(L304-327) 이식 — out-param(`regions`/`dividers`
 * 배열을 인자로 받아 push) 대신 결과 객체를 반환한다(내부 재귀 헬퍼
 * `layoutNode`는 dc와 동일하게 두 배열에 push하는 방식을 유지 — 순서가
 * dc와 동치임을 보장하기 위함. `src/state/dockTree.test.ts`의 R3 동치
 * 테스트가 이 순서까지 단언한다).
 *
 * - **R4(접기)**: `aCol`/`bCol`은 **직계 leaf 자식**이 `collapsed === true`
 *   일 때만 참(조상/자손의 collapsed는 무관 — dc `node.a.type === "leaf" &&
 *   node.a.collapsed`와 동치). 한쪽만 접히면 그 쪽은 split 방향 고정
 *   `COLLAPSED_STRIP_PX`(34) strip, 반대쪽이 나머지 전부를 차지한다. 양쪽
 *   다 정상이거나 **양쪽 다 접혀 있으면**(인위적 케이스) `ratio` 기반 분할로
 *   돌아간다 — dc 정본 그대로(가드 없음).
 * - **divider 비활성화(R4)**: 접힌 leaf가 한쪽이라도 있으면(`aCol || bCol`)
 *   그 split의 divider는 아예 push되지 않는다 — 접힌 strip은 드래그로
 *   리사이즈할 수 없다는 의미.
 * - `null` 트리는 빈 결과(`regions: [], dividers: []`)를 반환한다.
 */
export function layoutDockTree(
  tree: DockNode | null,
  width: number,
  height: number,
): { regions: DockRegion[]; dividers: DockDivider[] } {
  const regions: DockRegion[] = [];
  const dividers: DockDivider[] = [];
  if (tree !== null) {
    layoutNode(tree, 0, 0, width, height, [], regions, dividers);
  }
  return { regions, dividers };
}

function layoutNode(
  node: DockNode,
  x: number,
  y: number,
  w: number,
  h: number,
  path: DockPath,
  regions: DockRegion[],
  dividers: DockDivider[],
): void {
  if (node.type === "leaf") {
    regions.push({ leaf: node, x, y, w, h, path });
    return;
  }
  const D = DIVIDER_PX;
  const aCol = node.a.type === "leaf" && node.a.collapsed === true;
  const bCol = node.b.type === "leaf" && node.b.collapsed === true;
  if (node.dir === "row") {
    let aw: number;
    if (aCol && !bCol) aw = COLLAPSED_STRIP_PX;
    else if (bCol && !aCol) aw = w - D - COLLAPSED_STRIP_PX;
    else aw = Math.round((w - D) * node.ratio);
    layoutNode(node.a, x, y, aw, h, [...path, "a"], regions, dividers);
    layoutNode(
      node.b,
      x + aw + D,
      y,
      w - aw - D,
      h,
      [...path, "b"],
      regions,
      dividers,
    );
    if (!aCol && !bCol) {
      dividers.push({
        dir: "row",
        x: x + aw,
        y,
        w: D,
        h,
        path,
        ratio: node.ratio,
        spanW: w,
        spanH: h,
      });
    }
  } else {
    let ah: number;
    if (aCol && !bCol) ah = COLLAPSED_STRIP_PX;
    else if (bCol && !aCol) ah = h - D - COLLAPSED_STRIP_PX;
    else ah = Math.round((h - D) * node.ratio);
    layoutNode(node.a, x, y, w, ah, [...path, "a"], regions, dividers);
    layoutNode(
      node.b,
      x,
      y + ah + D,
      w,
      h - ah - D,
      [...path, "b"],
      regions,
      dividers,
    );
    if (!aCol && !bCol) {
      dividers.push({
        dir: "col",
        x,
        y: y + ah,
        w,
        h: D,
        path,
        ratio: node.ratio,
        spanW: w,
        spanH: h,
      });
    }
  }
}

/**
 * divider 드래그 중 새 비율을 0.15~0.85 비율 클램프 + 픽셀 최소(R7,
 * `MIN_LEAF_WIDTH`/`MIN_LEAF_HEIGHT`) 클램프로 겹쳐 반환한다. dc `onMove`의
 * `divider` 분기(L420-424) 이식.
 *
 * 퇴화 가드(`span <= 0`, dc 미정의): divider 두께(`DIVIDER_PX`)보다 스팬이
 * 작거나 같아 최소 픽셀 분수 자체가 정의되지 않는 경우, 0.15~0.85 기본
 * 클램프만 적용한다 — dc에는 이 케이스에 대한 처리가 없으나(0 나눗셈/음수
 * 스팬으로 이어짐), 실사용에서 도달 불가능한 극단값이므로 안전한 기본
 * 클램프로 방어한다.
 *
 * `span > 0`인 일반 케이스에서 `lo > hi`가 되는 퇴화 케이스(스팬이 좁아
 * 양쪽 최소값을 동시에 만족 못함)는 **dc 수식 그대로** `Math.min(hi,
 * Math.max(lo, ratio))`를 적용한다 — `Math.max(lo, ratio) >= lo > hi`이므로
 * 항상 `hi`가 이긴다(dc와 동치인 의도된 동작, followup 아님).
 */
export function clampDividerRatio(
  dir: "row" | "col",
  spanW: number,
  spanH: number,
  ratio: number,
): number {
  const span = (dir === "row" ? spanW : spanH) - DIVIDER_PX;
  if (span <= 0) return Math.min(0.85, Math.max(0.15, ratio));
  const minFrac = (dir === "row" ? MIN_LEAF_WIDTH : MIN_LEAF_HEIGHT) / span;
  const lo = Math.max(0.15, minFrac);
  const hi = Math.min(0.85, 1 - minFrac);
  return Math.min(hi, Math.max(lo, ratio));
}

// ============================================================
// 드롭 판정 + 도킹 삽입 모델 (B4-U1)
// 정본: `design/Docking Prototype.dc.html` `computeDrop`(L442-464) /
// `_fallbackTarget`(L429-432) / `dockGhost`(L466-487) / `_samePath`(L333).
// R11("반응형") — 밴드/존 픽셀은 규칙(명명 상수)으로 이식하고, 앱은
// 반응형이므로 BW/BH 같은 dc의 고정 레퍼런스 상수 대신 호출부가 넘기는
// width/height를 쓴다.
// ============================================================

/** dc `computeDrop`의 `y - reg.y <= 34`(L445) — region 상단 탭바 존 높이(px).
 * R11: 픽셀은 규칙으로 받는다(매직 넘버 금지). */
export const TAB_BAR_DROP_PX = 34;

/** dc `computeDrop`의 `band = 42`(L443) — 셸 바깥 가장자리 도킹 밴드
 * 두께(px). R11: 픽셀은 규칙으로 받는다. */
export const OUTER_DROP_BAND_PX = 42;

/** dc `computeDrop`의 `E = 0.22`(L453) — region 내부 가장자리 스플릿
 * 존(비율). 이보다 커서가 중심에 가까우면(m > E) 스플릿 대신 탭 병합. */
export const REGION_EDGE_DROP_FRAC = 0.22;

/** dc `dockGhost`의 outer 분기 `ratio: first ? 0.28 : 0.72`(L474) — 셸
 * 바깥 도킹 시 새 leaf(좌/상)가 차지하는 비율. 우/하는 `1 -
 * OUTER_DOCK_RATIO`로 파생(dc의 0.72와 동치). */
export const OUTER_DOCK_RATIO = 0.28;

/** dc `dockGhost`의 region 스플릿 분기 `ratio: first ? 0.4 : 0.6`(L482) —
 * region 내부 가장자리 스플릿 시 새 leaf(좌/상)가 차지하는 비율. 우/하는
 * `1 - REGION_SPLIT_RATIO`로 파생(dc의 0.6과 동치). */
export const REGION_SPLIT_RATIO = 0.4;

/** dc `computeDrop`의 outer 프리뷰 `BW * 0.32`/`BH * 0.32`(L447-450) — 셸
 * 바깥 도킹 프리뷰의 폭/높이 비율. 우/하 프리뷰의 시작 좌표는
 * `1 - OUTER_PREVIEW_FRAC`(dc의 0.68과 동치)로 파생. */
export const OUTER_PREVIEW_FRAC = 0.32;

/** 삽입 대상이 region 안일 때의 세부 위치. dc `computeDrop`의
 * `zone`(L446·L457·L459-462) 이식 — `"center"`는 탭 병합, 나머지 4개는
 * 가장자리 스플릿. */
export type RegionDropZone = "center" | "left" | "right" | "top" | "bottom";

/** 삽입 대상이 셸 바깥 가장자리일 때의 방향. dc `computeDrop`의
 * `side`(L447-450) 이식. */
export type OuterDropSide = "left" | "right" | "top" | "bottom";

/**
 * 드롭 삽입 대상 — dc `computeDrop`/`_fallbackTarget`이 반환하는 `t.kind`
 * 판별 유니온의 이식. 프리뷰(UI 표시용 사각형)는 별도 `DropPreviewRect`로
 * 분리한다 — dc의 fallback 타깃(`_fallbackTarget`)은 `preview` 필드가 아예
 * 없으므로, 타깃 자체에 optional `preview?`를 두면
 * `exactOptionalPropertyTypes` 하에서 "있는 경우/없는 경우"를 구분해 만드는
 * 코드가 지저분해진다. 타깃(어디에 삽입할지)과 프리뷰(무엇을 그릴지)를
 * 아예 분리하면 fallback 타깃은 프리뷰 필드 자체가 없는 형태로 자연스럽게
 * 표현된다.
 */
export type DockDropTarget =
  | { kind: "region"; zone: RegionDropZone; path: DockPath }
  | { kind: "outer"; side: OuterDropSide }
  | { kind: "empty" };

/** 드롭 프리뷰 사각형(픽셀). dc `computeDrop`의 각 분기 `preview`
 * 이식(L446·L447-450·L457·L459-462). */
export interface DropPreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `computeDropTarget`의 반환값 — 삽입 타깃 + 프리뷰 사각형 + 라벨을 한
 * 묶음으로 표현한다. dc `computeDrop`이 반환하는 객체(`{kind, ..., preview,
 * label}`)를 타깃/프리뷰로 분리한 것(위 `DockDropTarget` 주석 참조). */
export interface DropHit {
  target: DockDropTarget;
  preview: DropPreviewRect;
  label: string;
}

/**
 * 커서 좌표에서 드롭 타깃을 판정한다. dc `computeDrop`(L442-464) 이식 —
 * `BW`/`BH`(dc의 1440×826 고정 레퍼런스)를 `width`/`height` 파라미터로
 * 일반화했다(R11: 앱은 반응형).
 *
 * 판정 순서는 dc와 동치(먼저 매치하는 분기가 이긴다):
 * 1. 커서가 속한 region(첫 매치)을 찾고, 그 region 상단
 *    `TAB_BAR_DROP_PX` 안이면 탭바에 추가(`zone: "center"`) — **바깥 밴드
 *    검사보다 먼저**다. 가장자리 패널의 헤더에도 탭을 붙일 수 있어야 하기
 *    때문(그 헤더가 `OUTER_DROP_BAND_PX` 안에 있을 수 있음).
 * 2. 셸 바깥 `OUTER_DROP_BAND_PX` 밴드(좌/우/상/하 — dc와 동일하게 이
 *    순서로 검사) → outer 도킹.
 * 3. 그 시점까지 속한 region이 없으면 `null`.
 * 4. region 안: 4변까지의 정규화 거리 중 최솟값 `m`이
 *    `REGION_EDGE_DROP_FRAC`보다 크면 중앙 병합, 아니면 그 변으로 스플릿 —
 *    동률 판별 순서는 dc L459-462 그대로(`m===dl` → left 우선, 이어서
 *    right, top, 그 외 bottom).
 */
export function computeDropTarget(
  x: number,
  y: number,
  width: number,
  height: number,
  regions: DockRegion[],
): DropHit | null {
  const reg = regions.find(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
  );

  if (reg !== undefined && y - reg.y <= TAB_BAR_DROP_PX) {
    return {
      target: { kind: "region", zone: "center", path: reg.path },
      preview: { x: reg.x, y: reg.y, w: reg.w, h: 32 },
      label: "Add to tab bar",
    };
  }

  if (x < OUTER_DROP_BAND_PX) {
    return {
      target: { kind: "outer", side: "left" },
      preview: { x: 0, y: 0, w: width * OUTER_PREVIEW_FRAC, h: height },
      label: "Dock left",
    };
  }
  if (x > width - OUTER_DROP_BAND_PX) {
    return {
      target: { kind: "outer", side: "right" },
      preview: {
        x: width * (1 - OUTER_PREVIEW_FRAC),
        y: 0,
        w: width * OUTER_PREVIEW_FRAC,
        h: height,
      },
      label: "Dock right",
    };
  }
  if (y < OUTER_DROP_BAND_PX) {
    return {
      target: { kind: "outer", side: "top" },
      preview: { x: 0, y: 0, w: width, h: height * OUTER_PREVIEW_FRAC },
      label: "Dock top",
    };
  }
  if (y > height - OUTER_DROP_BAND_PX) {
    return {
      target: { kind: "outer", side: "bottom" },
      preview: {
        x: 0,
        y: height * (1 - OUTER_PREVIEW_FRAC),
        w: width,
        h: height * OUTER_PREVIEW_FRAC,
      },
      label: "Dock bottom",
    };
  }

  if (reg === undefined) return null;

  const fx = (x - reg.x) / reg.w;
  const fy = (y - reg.y) / reg.h;
  const dl = fx;
  const dr = 1 - fx;
  const dt = fy;
  const db = 1 - fy;
  const m = Math.min(dl, dr, dt, db);

  if (m > REGION_EDGE_DROP_FRAC) {
    return {
      target: { kind: "region", zone: "center", path: reg.path },
      preview: { x: reg.x, y: reg.y, w: reg.w, h: reg.h },
      label: "Add as tab",
    };
  }

  let zone: RegionDropZone;
  let preview: DropPreviewRect;
  if (m === dl) {
    zone = "left";
    preview = { x: reg.x, y: reg.y, w: reg.w / 2, h: reg.h };
  } else if (m === dr) {
    zone = "right";
    preview = { x: reg.x + reg.w / 2, y: reg.y, w: reg.w / 2, h: reg.h };
  } else if (m === dt) {
    zone = "top";
    preview = { x: reg.x, y: reg.y, w: reg.w, h: reg.h / 2 };
  } else {
    zone = "bottom";
    preview = { x: reg.x, y: reg.y + reg.h / 2, w: reg.w, h: reg.h / 2 };
  }

  return {
    target: { kind: "region", zone, path: reg.path },
    preview,
    label: `Split ${zone}`,
  };
}

/**
 * 드래그 release 시점에 활성 드롭 타깃이 없을 때 쓰는 폴백. dc
 * `_fallbackTarget`(L429-432) 이식 — R1("플로팅 없음"): 드롭 타깃이 없어도
 * 반드시 첫 region(`regions[0]`)에 도킹되며, 뜬 상태(floating)로 남는
 * 경우는 없다. region이 하나도 없으면(트리가 비어 있으면) `{kind:
 * "empty"}` — 이 경우는 `insertDetachedLeaf`가 leaf를 새 루트로 만든다.
 */
export function fallbackDropTarget(regions: DockRegion[]): DockDropTarget {
  const first = regions[0];
  return first === undefined
    ? { kind: "empty" }
    : { kind: "region", zone: "center", path: first.path };
}

/**
 * 분리된(드래그 중이던) leaf를 드롭 타깃 위치에 삽입한 새 트리를 반환한다
 * (불변 갱신). dc `dockGhost`(L466-487) 이식 — dc는 `this.dc.uid++`로 새
 * leaf id를 발급하지만, 이 함수는 순수 함수이므로 `leaf`를 파라미터로
 * 받는다(id 발급은 호출부 책임 — B4의 스토어 액션에서 처리).
 *
 * - `tree`가 `null`이거나 타깃이 `{kind:"empty"}` → `leaf`가 새 루트.
 * - `{kind:"outer"}` → `dir`은 좌/우면 `"row"`, 상/하면 `"col"`.
 *   `first`(좌/상)이면 `leaf`가 `a`(비율 `OUTER_DOCK_RATIO`), 아니면
 *   `tree`가 `a`(비율 `1 - OUTER_DOCK_RATIO`) — 즉 새 leaf는 항상 지정된
 *   쪽에, 기존 트리는 반대쪽에 온다.
 * - `{kind:"region", zone:"center"}` → 해당 경로의 노드에 탭을 병합
 *   (`tabs`에 `leaf.tabs`를 이어붙이고 `active`는 `leaf.active`로 갱신).
 *   경로가 leaf를 가리키지 않으면(존재하지 않거나 split이면) **방어적으로
 *   원본 `tree`를 그대로 반환**한다 — 스토어 액션들의 방어 가드 관례(예:
 *   `removePanel`의 not-found 분기)를 따름. dc 자체는 이 케이스를 다루지
 *   않지만(`computeDrop`이 항상 leaf의 경로만 만들어내므로 실사용에서
 *   도달하지 않음), 순수 함수로서 잘못된 입력에도 트리를 깨뜨리지 않기
 *   위한 방어다.
 * - `{kind:"region", zone: 나머지 4개}` → 해당 경로의 노드를 `leaf`와의
 *   split으로 치환한다. `dir`은 좌/우 존이면 `"row"`, 상/하 존이면
 *   `"col"`. `first`(좌/상 존)이면 `leaf`가 `a`(비율
 *   `REGION_SPLIT_RATIO`), 아니면 기존 노드가 `a`(비율
 *   `1 - REGION_SPLIT_RATIO`). 경로가 존재하지 않으면(`getNodeAt`이
 *   `null`) 위와 동일하게 원본을 반환한다.
 */
export function insertDetachedLeaf(
  tree: DockNode | null,
  target: DockDropTarget,
  leaf: DockLeaf,
): DockNode {
  if (tree === null || target.kind === "empty") {
    return leaf;
  }

  if (target.kind === "outer") {
    const dir: DockSplit["dir"] =
      target.side === "left" || target.side === "right" ? "row" : "col";
    const first = target.side === "left" || target.side === "top";
    return {
      type: "split",
      dir,
      ratio: first ? OUTER_DOCK_RATIO : 1 - OUTER_DOCK_RATIO,
      a: first ? leaf : tree,
      b: first ? tree : leaf,
    };
  }

  const node = getNodeAt(tree, target.path);
  if (target.zone === "center") {
    if (node === null || node.type !== "leaf") return tree;
    return setNodeAt(tree, target.path, {
      ...node,
      tabs: [...node.tabs, ...leaf.tabs],
      active: leaf.active,
    });
  }

  if (node === null) return tree;
  const dir: DockSplit["dir"] =
    target.zone === "left" || target.zone === "right" ? "row" : "col";
  const first = target.zone === "left" || target.zone === "top";
  const split: DockSplit = {
    type: "split",
    dir,
    ratio: first ? REGION_SPLIT_RATIO : 1 - REGION_SPLIT_RATIO,
    a: first ? leaf : node,
    b: first ? node : leaf,
  };
  return setNodeAt(tree, target.path, split);
}

/**
 * 두 경로가 같은 노드를 가리키는지 비교한다(길이 + 전 원소 일치). dc
 * `_samePath`(L333) 이식 — dc의 `onMove`가 드래그 중인 leaf의 region을
 * 찾을 때(`this.dc.regions.find((r) => this._samePath(r.path, pl.path))`)
 * 쓰는 것과 동치. B4-U3의 드래그 시작 시 region 매칭에 쓰인다.
 */
export function dockPathsEqual(a: DockPath, b: DockPath): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
