/**
 * 도킹 트리 — 순수 데이터 모델(React/zustand 의존 없음, JSON 직렬화 가능).
 *
 * 정본: `design/App Shell.dc.html`의 도킹 엔진(트리 레이아웃·드래그/드롭·
 * divider·collapse/maximize·＋Panel·Reset). 이 파일은 그 `_defaultTree()` /
 * `_getAt` / `_setAt` / `_collect` / `_removePanel`을 순수 TS로 이식한
 * 것이다(트리 타입·경로 조회/갱신·패널 제거).
 *
 * 같은 폴더의 형제 모듈은 이 모듈에만 의존한다(단방향):
 * - `geometry.ts` — `_layout`/divider 클램프 이식과 픽셀 상수
 *   (`DIVIDER_PX`·`COLLAPSED_STRIP_PX`·`MIN_LEAF_WIDTH`/`MIN_LEAF_HEIGHT`).
 * - `drop.ts` — `computeDrop`/`_fallbackTarget`/`dockGhost`/`_samePath`
 *   이식. 배치 결과 타입(`DockRegion`)은 `geometry.ts`에서 가져온다.
 * - `snapshot.ts` — `sanitizeDockLayoutSnapshot`. dc 이식이 아니라
 *   localStorage 영속화 전용 검증기다. localStorage는 신뢰할 수 없는
 *   입력(구버전 스키마·수동 편집·쿼터 손상)이므로 하이드레이션 전 반드시
 *   이 검증기를 통과시켜야 한다.
 */

/** 도킹 가능한 5종 패널. problems/diagnostics는 포함하지 않는다 —
 * diagnostics는 `debugUiStore.open` 단일 출처를 유지하며 도킹 탭이
 * 아니다(하단 트랜지언트 오버레이로 별도 처리). */
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

/** dc `ALL` — 도킹 가능한 전체 패널 id 목록. */
export const DOCK_PANEL_IDS: readonly DockPanelId[] = [
  "nodeEditor",
  "viewport",
  "inspector",
  "code",
  "assets",
];

/**
 * 기본 도킹 트리 — App Shell `_defaultTree()` 이식 그대로: **좌측
 * 컬럼(25%) = Code**(풀하이트, 접기 가능) · **중앙 = Node Editor**(노드
 * 그래프가 화면 주역, 최대 면적) · **우측 컬럼 = col[Viewport(상) /
 * Inspector·Assets(하)]**. 매 호출마다 새 객체를 반환한다(공유 참조 없음).
 * leaf id는 dc와 동일하게 유지(l1~l4, load-bearing —
 * `sanitizeDockLayoutSnapshot`의 `nextLeafId` 하한 5와 맞물림).
 */
export function createDefaultDockTree(): DockNode {
  return {
    type: "split",
    dir: "row",
    ratio: 0.25,
    a: {
      type: "leaf",
      id: "l4",
      tabs: ["code"],
      active: "code",
      collapsed: false,
    },
    b: {
      type: "split",
      dir: "row",
      ratio: 0.6,
      a: { type: "leaf", id: "l3", tabs: ["nodeEditor"], active: "nodeEditor" },
      b: {
        type: "split",
        dir: "col",
        ratio: 0.52,
        a: { type: "leaf", id: "l1", tabs: ["viewport"], active: "viewport" },
        b: {
          type: "leaf",
          id: "l2",
          tabs: ["inspector", "assets"],
          active: "inspector",
        },
      },
    },
  };
}

/**
 * 주어진 경로의 노드를 조회한다. dc `_getAt` 이식 — 재귀 인덱싱 대신
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
 * 이식. 잘못된 경로(leaf 아래로 더 내려가는 경로)는 원본을
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
 * 이식 — out-param 대신 배열을 반환한다. `null` 입력은 빈
 * 배열을 반환한다.
 */
export function collectPanelIds(node: DockNode | null): DockPanelId[] {
  if (node === null) return [];
  if (node.type === "leaf") return [...node.tabs];
  return [...collectPanelIds(node.a), ...collectPanelIds(node.b)];
}

/**
 * 주어진 leaf id의 경로를 찾는다. dc `_pathOf`의 참조 비교를
 * leaf-id 비교로 바꾼 변형 — leaf이고 `id`가 일치하면 현재 경로, split이면
 * a를 먼저 재귀 탐색 후 b. 없으면 `null`(toggleMaximized/maximized
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

/** 주어진 패널 id를 탭으로 가진 첫 leaf(a 우선)의 경로. dc `_findLeaf`의
 * `tabs.includes` 분기 이식 — leaf id 비교 분기는 `findLeafPath`가
 * 담당한다(StatusBar가 호출). */
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

/** viewport/code는 이종 leaf 병합에서 배제된다(디자인 결정: "viewport·
 * code는 같은 kind끼리만 병합"). 두 tabs 집합의 합집합에 viewport/code가
 * 하나도 없으면 무조건
 * 허용(대부분의 실사용 케이스 — 예: inspector↔nodeEditor). 합집합에
 * 하나라도 있으면, 두 집합이 **동일한 단일 exclusive kind**일 때만
 * 허용한다 — 즉 `targetTabs`/`draggedTabs` 둘 다 정확히 `["viewport"]`
 * 이거나 둘 다 정확히 `["code"]`인 경우뿐이다. 이 "동일 kind끼리" 분기는
 * 실사용에서 도달하지 않는다(그 kind의 패널은 트리에 최대 하나뿐이므로 병합
 * 대상이 이미 그 kind를 담고 있으면 dragged 쪽엔 애초에 그 kind가 없다) —
 * 그래도 두 집합 비교라는 술어를 총함수로 완결하기 위해 대칭적으로 남겨둔다
 * (테스트는 공개 API인 `insertDetachedLeaf`/`firstMergeableLeafPath` 경유로
 * 검증 — `drop.ts`의 `insertDetachedLeaf`가 공유하기 위해서만 export한다). */
export function canMergeDockTabs(
  targetTabs: readonly DockPanelId[],
  draggedTabs: readonly DockPanelId[],
): boolean {
  const EXCLUSIVE_KINDS: readonly DockPanelId[] = ["viewport", "code"];
  const union = new Set<DockPanelId>([...targetTabs, ...draggedTabs]);
  const hasExclusive = EXCLUSIVE_KINDS.some((kind) => union.has(kind));
  if (!hasExclusive) return true;
  return EXCLUSIVE_KINDS.some((kind) => {
    const targetIsSoloKind = targetTabs.length === 1 && targetTabs[0] === kind;
    const draggedIsSoloKind =
      draggedTabs.length === 1 && draggedTabs[0] === kind;
    return targetIsSoloKind && draggedIsSoloKind;
  });
}

/**
 * `id` 패널이 병합 가능한 첫 leaf(in-order, a 우선)의 경로를 반환한다. dc
 * `addPanel`이 `this.dc.regions[0]`을 새 탭의 삽입 대상으로 쓰는 것의
 * 일반화 — `canMergeDockTabs`에 따라 **`id`를 병합해도
 * viewport/code 이종 leaf가 생기지 않는 leaf만** 후보로 삼는다(대상 leaf의
 * `tabs`와 `[id]` 두 집합으로 판정). 그런 leaf가 트리에 하나도 없으면(예:
 * 트리가 code/viewport leaf뿐이고 `id`가 그 어느 것도 아닌 경우, 또는
 * `id` 자체가 viewport/code라 애초에 기존 leaf 어디에도 솔로 매치가 없는
 * 경우 — 실사용에서는 사실상 항상 이 경우) `null` — 호출부
 * (`dockStore.addPanel`)가 outer-right에 새 leaf를 만들어 폴백한다.
 * `null` 입력은
 * `null`을 반환한다.
 */
export function firstMergeableLeafPath(
  node: DockNode | null,
  id: DockPanelId,
): DockPath | null {
  if (node === null) return null;
  if (node.type === "leaf") {
    return canMergeDockTabs(node.tabs, [id]) ? [] : null;
  }
  const inA = firstMergeableLeafPath(node.a, id);
  if (inA !== null) return ["a", ...inA];
  const inB = firstMergeableLeafPath(node.b, id);
  return inB === null ? null : ["b", ...inB];
}

/**
 * 트리에서 `id` 패널을 제거한다. dc `_removePanel` 이식.
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
