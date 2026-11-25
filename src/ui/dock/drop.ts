import type { DockRegion } from "./geometry";
import {
  canMergeDockTabs,
  type DockLeaf,
  type DockNode,
  type DockPath,
  type DockSplit,
  getNodeAt,
  setNodeAt,
} from "./tree";

// ============================================================
// 드롭 판정 + 도킹 삽입 모델
// 정본: `design/App Shell.dc.html` 도킹 엔진의 `computeDrop` /
// `_fallbackTarget` / `dockGhost` / `_samePath`.
// 밴드/존 픽셀은 규칙(명명 상수)으로 이식하고, 앱은 반응형이므로 BW/BH
// 같은 dc의 고정 레퍼런스 상수 대신 호출부가 넘기는 width/height를 쓴다.
// ============================================================

/** dc `computeDrop`의 `y - reg.y <= 34` — region 상단 탭바 존 높이(px). */
const TAB_BAR_DROP_PX = 34;

/** dc `computeDrop`의 `band = 42` — 셸 바깥 가장자리 도킹 밴드 두께(px). */
const OUTER_DROP_BAND_PX = 42;

/** dc `computeDrop`의 `E = 0.22` — region 내부 가장자리 스플릿
 * 존(비율). 이보다 커서가 중심에 가까우면(m > E) 스플릿 대신 탭 병합. */
const REGION_EDGE_DROP_FRAC = 0.22;

/** dc `dockGhost`의 outer 분기 `ratio: first ? 0.28 : 0.72` — 셸
 * 바깥 도킹 시 새 leaf(좌/상)가 차지하는 비율. 우/하는 `1 -
 * OUTER_DOCK_RATIO`로 파생(dc의 0.72와 동치). */
export const OUTER_DOCK_RATIO = 0.28;

/** dc `dockGhost`의 region 스플릿 분기 `ratio: first ? 0.4 : 0.6` —
 * region 내부 가장자리 스플릿 시 새 leaf(좌/상)가 차지하는 비율. 우/하는
 * `1 - REGION_SPLIT_RATIO`로 파생(dc의 0.6과 동치). */
export const REGION_SPLIT_RATIO = 0.4;

/** dc `computeDrop`의 outer 프리뷰 `BW * 0.32`/`BH * 0.32` — 셸
 * 바깥 도킹 프리뷰의 폭/높이 비율. 우/하 프리뷰의 시작 좌표는
 * `1 - OUTER_PREVIEW_FRAC`(dc의 0.68과 동치)로 파생. */
export const OUTER_PREVIEW_FRAC = 0.32;

/** 삽입 대상이 region 안일 때의 세부 위치. dc `computeDrop`의
 * `zone` 이식 — `"center"`는 탭 병합, 나머지 4개는
 * 가장자리 스플릿. */
export type RegionDropZone = "center" | "left" | "right" | "top" | "bottom";

/** 삽입 대상이 셸 바깥 가장자리일 때의 방향. dc `computeDrop`의
 * `side` 이식. */
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

/** 드롭 프리뷰 사각형(픽셀). dc `computeDrop`의 각 분기 `preview` 이식. */
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
 * 커서 좌표에서 드롭 타깃을 판정한다. dc `computeDrop` 이식 —
 * `BW`/`BH`(dc의 1440×826 고정 레퍼런스)를 `width`/`height` 파라미터로
 * 일반화했다(앱은 반응형).
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
 *    동률 판별 순서는 dc `computeDrop` 그대로(`m===dl` → left 우선, 이어서
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
 * `_fallbackTarget` 이식 — "플로팅 없음" 규칙: 드롭 타깃이 없어도
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
 * (불변 갱신). dc `dockGhost` 이식 — dc는 `this.dc.uid++`로 새
 * leaf id를 발급하지만, 이 함수는 순수 함수이므로 `leaf`를 파라미터로
 * 받는다(id 발급은 호출부 책임 — 스토어 액션에서 처리).
 *
 * - `tree`가 `null`이거나 타깃이 `{kind:"empty"}` → `leaf`가 새 루트.
 * - `{kind:"outer"}` → `dir`은 좌/우면 `"row"`, 상/하면 `"col"`.
 *   `first`(좌/상)이면 `leaf`가 `a`(비율 `OUTER_DOCK_RATIO`), 아니면
 *   `tree`가 `a`(비율 `1 - OUTER_DOCK_RATIO`) — 즉 새 leaf는 항상 지정된
 *   쪽에, 기존 트리는 반대쪽에 온다.
 * - `{kind:"region", zone:"center"}` → **이종 병합 게이트**: 대상 leaf의
 *   `tabs`와 `leaf.tabs`가 `canMergeDockTabs`를 통과하면 탭을 병합
 *   (`tabs`에 `leaf.tabs`를 이어붙이고 `active`는 `leaf.active`로 갱신).
 *   대상 leaf가 접혀 있었다면 그 경우에만 `collapsed: false`로 펼친다 —
 *   접힌 레일 뒤로 드롭한 패널이 사라지는 것을 막는다.
 *   통과하지 못하면(viewport/code가 관여하는 이종 병합) **탭 병합 대신
 *   `zone:"right"`와 동일한 기하의 스플릿으로 폴백**한다(대상 leaf가 `a`
 *   비율 `1 - REGION_SPLIT_RATIO`, 새 leaf가 `b` 비율 `REGION_SPLIT_RATIO`
 *   — 새 leaf가 우측 40%). ⚠ 여기서 원본 `tree`를 그대로 반환하면 이미
 *   트리에서 분리된 leaf가 통째로 유실된다("플로팅 없음" 위반 — 드래그
 *   중이던 leaf는 반드시 어딘가에 다시 도킹돼야 한다) — 그래서 not-found
 *   방어 가드(아래)와 달리 이 분기는 "포기"가 아니라 "폴백"이다.
 *   `phase-35-dock-drag.spec.ts`의 "release outside any target"(툴바 위
 *   release → `fallbackDropTarget`이 code leaf의 center를 고름)이 이
 *   폴백에 의존한다. 폴백 형태(우측 스플릿)는 정본에 명시되지 않은 구현
 *   판단이다.
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
    if (!canMergeDockTabs(node.tabs, leaf.tabs)) {
      // viewport/code 이종 병합 금지 — zone "right"와 동치인 스플릿으로
      // 흡수한다(위 함수 doc 주석 참고). setNodeAt으로 흡수해야 분리된
      // leaf가 유실되지 않는다.
      return setNodeAt(tree, target.path, {
        type: "split",
        dir: "row",
        ratio: 1 - REGION_SPLIT_RATIO,
        a: node,
        b: leaf,
      });
    }
    return setNodeAt(tree, target.path, {
      ...node,
      tabs: [...node.tabs, ...leaf.tabs],
      active: leaf.active,
      // 접힌 leaf에 탭을 병합하면 드롭된 패널이 34px 레일 뒤에 숨어 사라진
      // 것처럼 보인다 — 병합은 "이 leaf를 지금 보여달라"는 의도이므로 접힘을
      // 편다(dc 미정의 코너). 조건부 스프레드라 이미 펼쳐진(=`collapsed` 키가
      // 없는) leaf의 형태는 그대로 유지된다.
      ...(node.collapsed === true ? { collapsed: false } : {}),
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
 * `_samePath` 이식. 드래그 시작 시 드래그 중인 leaf의 region 매칭에
 * 쓰인다(dc `onMove`의 `regions.find(... _samePath ...)`와 동치).
 */
export function dockPathsEqual(a: DockPath, b: DockPath): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
