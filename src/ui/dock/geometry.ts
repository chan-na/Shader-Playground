/**
 * 도킹 트리 레이아웃 기하 — 트리를 픽셀 영역(leaf region + divider)으로
 * 배치하고 divider 드래그 비율을 클램프한다. dc `_layout`(L304-327) /
 * `onMove`의 divider 분기 이식(B1-3). 트리 모델은 `tree.ts`.
 */
import type { DockLeaf, DockNode, DockPath } from "./tree";

/** dc `_layout`의 `const D = 6`(L307) — divider(스플리터 바) 두께(px). */
export const DIVIDER_PX = 6;

/** dc `COLLAPSED`(L264) — 접힌 leaf의 split 방향 고정 strip 두께(px, R4). */
export const COLLAPSED_STRIP_PX = 34;

/** dc `MIN_W`/`MIN_H`(L263) — 전역 leaf 최소 크기(px, R7). */
export const MIN_LEAF_WIDTH = 240;
export const MIN_LEAF_HEIGHT = 160;

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
 * dc와 동치임을 보장하기 위함. `src/ui/dock/geometry.test.ts`의 R3 동치
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
