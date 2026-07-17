/**
 * 도킹 트리 — 순수 데이터 모델(React/zustand 의존 없음, JSON 직렬화 가능).
 *
 * 정본 출처: `design/Docking Prototype.dc.html`(v1.4) + `design/CHANGELOG.md`
 * §v1.4 R1·R2·R3·R4·R7. 이 파일은 dc의 `_defaultTree()` / `_getAt` / `_setAt` /
 * `_collect` / `MIN_W`·`MIN_H`를 순수 TS로 이식한 B1-1 산출물(+ B1-3에서
 * `_layout`/divider 클램프 이식 추가)이다.
 * `src/state/layoutStore.ts`(기존 4분할 레이아웃 스토어)는 B2에서 이 트리
 * 모델로 교체될 예정이며, 그 전까지는 병행 존재가 의도된 상태다 — 건드리지
 * 않는다.
 *
 * ⚠ 결함 정정: dc `_defaultTree()`(L276-290)는 가운데 split(viewport ↔
 * inspector/assets)을 `dir:"row"`로 정의하지만, 이는 **정본 결함**이다.
 * R2("App Shell = 기본 레이아웃 정본") 타이브레이크에 따라 아래
 * `createDefaultDockTree()`는 `dir:"col"`로 구현한다. 근거:
 *   - 0.556 = 1.25/2.25 = 현행 `layoutStore.viewportFrac`(**높이** 비율).
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
