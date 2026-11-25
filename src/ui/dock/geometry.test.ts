import { describe, expect, it } from "vitest";
import {
  clampDividerRatio,
  type DockDivider,
  type DockRegion,
  layoutDockTree,
  MIN_LEAF_HEIGHT,
  MIN_LEAF_WIDTH,
} from "./geometry";
import { asSplit } from "./testDockTree";
import { createDefaultDockTree, type DockLeaf, type DockNode } from "./tree";

describe("layoutDockTree — v2.0 기본 트리 = 현행 앱 첫 화면 동치", () => {
  it("lays out the default tree at 1440×826 into the 4 App Shell regions", () => {
    // 검산 근거(dc BW=1440, BH=826=900-툴바48-상태바26):
    //   359 = round((1440-6) × 0.25)   — root row split(좌 code / 우 나머지)
    //   641 = round((1075-6) × 0.60)   — inner row split(nodeEditor / col split),
    //                                     1075 = 1440 - 359 - 6(divider)
    //   426 = round((826-6) × 0.52)    — col split(viewport 상 / inspector·assets 하)
    const { regions, dividers } = layoutDockTree(
      createDefaultDockTree(),
      1440,
      826,
    );

    const expectedRegions: DockRegion[] = [
      {
        leaf: {
          type: "leaf",
          id: "l4",
          tabs: ["code"],
          active: "code",
          collapsed: false,
        },
        x: 0,
        y: 0,
        w: 359,
        h: 826,
        path: ["a"],
      },
      {
        leaf: {
          type: "leaf",
          id: "l3",
          tabs: ["nodeEditor"],
          active: "nodeEditor",
        },
        x: 365,
        y: 0,
        w: 641,
        h: 826,
        path: ["b", "a"],
      },
      {
        leaf: {
          type: "leaf",
          id: "l1",
          tabs: ["viewport"],
          active: "viewport",
        },
        x: 1012,
        y: 0,
        w: 428,
        h: 426,
        path: ["b", "b", "a"],
      },
      {
        leaf: {
          type: "leaf",
          id: "l2",
          tabs: ["inspector", "assets"],
          active: "inspector",
        },
        x: 1012,
        y: 432,
        w: 428,
        h: 394,
        path: ["b", "b", "b"],
      },
    ];
    expect(regions).toEqual(expectedRegions);

    // 순서는 구현의 실제 순회 순서(post-order: a 재귀 → b 재귀 → 자신의
    // divider push) 그대로 단언한다 — 가장 안쪽 split(col, path ["b","b"])이
    // 먼저 push되고, 그다음 inner row split(path ["b"]), 마지막에 root(path
    // [])가 push된다.
    const expectedDividers: DockDivider[] = [
      {
        dir: "col",
        x: 1012,
        y: 426,
        w: 428,
        h: 6,
        path: ["b", "b"],
        ratio: 0.52,
        spanW: 428,
        spanH: 826,
      },
      {
        dir: "row",
        x: 1006,
        y: 0,
        w: 6,
        h: 826,
        path: ["b"],
        ratio: 0.6,
        spanW: 1075,
        spanH: 826,
      },
      {
        dir: "row",
        x: 359,
        y: 0,
        w: 6,
        h: 826,
        path: [],
        ratio: 0.25,
        spanW: 1440,
        spanH: 826,
      },
    ];
    expect(dividers).toEqual(expectedDividers);
  });

  it("keeps every region at or above the R7 minimum (240×160)", () => {
    const { regions } = layoutDockTree(createDefaultDockTree(), 1440, 826);
    expect(regions.length).toBe(4);
    for (const region of regions) {
      expect(region.w).toBeGreaterThanOrEqual(MIN_LEAF_WIDTH);
      expect(region.h).toBeGreaterThanOrEqual(MIN_LEAF_HEIGHT);
    }
  });
});

describe("layoutDockTree — collapsed 34px strip + divider 비활성 (R4)", () => {
  it("collapses the left code leaf (root.a) into a 34px strip and disables the root divider", () => {
    const root = asSplit(createDefaultDockTree());
    const codeLeaf = root.a as DockLeaf;
    const tree: DockNode = { ...root, a: { ...codeLeaf, collapsed: true } };

    const { regions, dividers } = layoutDockTree(tree, 1440, 826);

    // aw(우측 나머지 폭) = 1440 - 6 - 34 = 1400 — 그 전체가 root.b 서브트리에
    // 전파되어 inner row split의 ratio 0.60을 다시 거치므로
    // round((1400-6) × 0.6) = 836이 nodeEditor leaf의 w가 된다.
    const nodeEditor = regions.find((r) => r.leaf.id === "l3");
    expect(nodeEditor).toMatchObject({ w: 836 });

    const code = regions.find((r) => r.leaf.id === "l4");
    expect(code).toMatchObject({ x: 0, y: 0, w: 34, h: 826 });

    // 루트 divider(path 길이 0)는 push되지 않는다 — 접힌 쪽이 있으면 그
    // split의 divider는 비활성.
    expect(dividers.some((d) => d.path.length === 0)).toBe(false);
    expect(dividers).toHaveLength(2);
  });

  it("collapses the viewport leaf (col split a-side) into a 34px strip, symmetric to the row-split case", () => {
    const root = asSplit(createDefaultDockTree());
    const inner = asSplit(root.b);
    const colSplit = asSplit(inner.b);
    const viewportLeaf = colSplit.a as DockLeaf;
    const tree: DockNode = {
      ...root,
      b: {
        ...inner,
        b: { ...colSplit, a: { ...viewportLeaf, collapsed: true } },
      },
    };

    const { regions, dividers } = layoutDockTree(tree, 1440, 826);

    const viewport = regions.find((r) => r.leaf.id === "l1");
    expect(viewport).toMatchObject({ x: 1012, y: 0, w: 428, h: 34 });

    const inspector = regions.find((r) => r.leaf.id === "l2");
    expect(inspector).toMatchObject({ x: 1012, y: 40, w: 428, h: 786 });

    // 그 split(path ["b","b"])의 divider만 비활성 — 조상(root/inner row)의
    // divider는 직계 leaf 자식이 아니므로 그대로 유지된다.
    expect(dividers.some((d) => d.path.join("") === "bb")).toBe(false);
    expect(dividers.some((d) => d.path.length === 0)).toBe(true);
    expect(dividers.some((d) => d.path.join("") === "b")).toBe(true);
    expect(dividers).toHaveLength(2);
  });

  it("falls back to ratio-based split (not the 34px strip) and disables the divider when both leaf children are collapsed", () => {
    const tree: DockNode = {
      type: "split",
      dir: "row",
      ratio: 0.4,
      a: {
        type: "leaf",
        id: "x1",
        tabs: ["nodeEditor"],
        active: "nodeEditor",
        collapsed: true,
      },
      b: {
        type: "leaf",
        id: "x2",
        tabs: ["viewport"],
        active: "viewport",
        collapsed: true,
      },
    };

    const { regions, dividers } = layoutDockTree(tree, 500, 300);

    // aw = round((500-6) × 0.4) = 198 — 양쪽 다 collapsed면 34px strip이 아닌
    // ratio 분할로 되돌아간다(dc 정본, 가드 없음).
    expect(regions).toEqual<DockRegion[]>([
      {
        leaf: {
          type: "leaf",
          id: "x1",
          tabs: ["nodeEditor"],
          active: "nodeEditor",
          collapsed: true,
        },
        x: 0,
        y: 0,
        w: 198,
        h: 300,
        path: ["a"],
      },
      {
        leaf: {
          type: "leaf",
          id: "x2",
          tabs: ["viewport"],
          active: "viewport",
          collapsed: true,
        },
        x: 204,
        y: 0,
        w: 296,
        h: 300,
        path: ["b"],
      },
    ]);
    expect(dividers).toEqual([]);
  });
});

describe("layoutDockTree — null/단일 leaf", () => {
  it("returns empty regions and dividers for a null tree", () => {
    expect(layoutDockTree(null, 1440, 826)).toEqual({
      regions: [],
      dividers: [],
    });
  });

  it("lays a single-leaf tree out to the full area with no dividers", () => {
    const leaf: DockLeaf = {
      type: "leaf",
      id: "solo",
      tabs: ["code"],
      active: "code",
    };
    expect(layoutDockTree(leaf, 1440, 826)).toEqual({
      regions: [{ leaf, x: 0, y: 0, w: 1440, h: 826, path: [] }],
      dividers: [],
    });
  });
});

describe("clampDividerRatio — R7", () => {
  it("guarantees the 240px minimum on the low side (row, spanW=1000)", () => {
    const result = clampDividerRatio("row", 1000, 826, 0.1);
    // lo = 240 / (1000-6) ≈ 0.24145
    expect(result).toBeCloseTo(240 / 994, 5);
    // 픽셀 검산: round((spanW - DIVIDER_PX) × result) === MIN_LEAF_WIDTH(240)
    expect(Math.round((1000 - 6) * result)).toBe(240);
  });

  it("guarantees the mirrored minimum on the high side (row, spanW=1000)", () => {
    const result = clampDividerRatio("row", 1000, 826, 0.95);
    // hi = 1 - 240 / (1000-6) ≈ 0.75855
    expect(result).toBeCloseTo(1 - 240 / 994, 5);
  });

  it("guarantees the 160px minimum on the low side (col, spanH=400)", () => {
    const result = clampDividerRatio("col", 1440, 400, 0.05);
    // lo = 160 / (400-6) ≈ 0.4061
    expect(result).toBeCloseTo(160 / 394, 4);
  });

  it("falls back to the plain 0.15/0.85 clamp when the span is large enough for the pixel minimum to be irrelevant", () => {
    expect(clampDividerRatio("row", 10000, 826, 0.01)).toBeCloseTo(0.15, 5);
    expect(clampDividerRatio("row", 10000, 826, 0.99)).toBeCloseTo(0.85, 5);
    expect(clampDividerRatio("col", 826, 10000, 0.01)).toBeCloseTo(0.15, 5);
    expect(clampDividerRatio("col", 826, 10000, 0.99)).toBeCloseTo(0.85, 5);
  });

  it("returns hi when the span is too narrow for both pixel minimums (lo > hi) — dc 수식 동치, 가드 아님", () => {
    // span = 480 - 6 = 474; minFrac = 240/474 ≈ 0.50633 → lo ≈ 0.50633, hi ≈ 0.49367.
    // lo > hi이므로 Math.max(lo, ratio) >= lo > hi가 항상 성립해 hi가 이긴다 — dc onMove
    // divider 분기 원본 수식 그대로, 이 함수가 임의로 추가한 가드가 아니다.
    const result = clampDividerRatio("row", 480, 826, 0.5);
    expect(result).toBeCloseTo(0.49367, 5);
    // ratio 입력값에 무관하게 항상 hi로 수렴함을 함께 확인.
    expect(clampDividerRatio("row", 480, 826, 0.01)).toBeCloseTo(0.49367, 5);
    expect(clampDividerRatio("row", 480, 826, 0.99)).toBeCloseTo(0.49367, 5);
  });

  it("applies the plain 0.15/0.85 clamp (no pixel term) when span <= 0 (degenerate guard, dc undefined)", () => {
    // spanW=6 → span = 6 - DIVIDER_PX(6) = 0 → 픽셀 분수가 정의되지 않는 극단값.
    expect(clampDividerRatio("row", 6, 826, 0.5)).toBe(0.5);
    expect(clampDividerRatio("row", 6, 826, 0.05)).toBe(0.15);
    expect(clampDividerRatio("row", 6, 826, 0.99)).toBe(0.85);
  });
});
