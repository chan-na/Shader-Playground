import { describe, expect, it } from "vitest";
import {
  COLLAPSED_STRIP_PX,
  clampDividerRatio,
  collectPanelIds,
  computeDropTarget,
  createDefaultDockTree,
  DIVIDER_PX,
  DOCK_PANEL_IDS,
  type DockDivider,
  type DockDropTarget,
  type DockLayoutSnapshot,
  type DockLeaf,
  type DockNode,
  type DockPath,
  type DockRegion,
  type DockSplit,
  type DropHit,
  type DropPreviewRect,
  dockPathsEqual,
  fallbackDropTarget,
  findLeafPath,
  findTabLeafPath,
  firstLeafPath,
  getNodeAt,
  insertDetachedLeaf,
  layoutDockTree,
  MIN_LEAF_HEIGHT,
  MIN_LEAF_WIDTH,
  OUTER_DOCK_RATIO,
  OUTER_DROP_BAND_PX,
  OUTER_PREVIEW_FRAC,
  type OuterDropSide,
  REGION_EDGE_DROP_FRAC,
  REGION_SPLIT_RATIO,
  type RegionDropZone,
  removePanel,
  sanitizeDockLayoutSnapshot,
  setNodeAt,
  TAB_BAR_DROP_PX,
} from "./dockTree";

/** 테스트 전용 narrowing 헬퍼 — split이 아니면 즉시 실패시켜 이후 접근을
 * 타입 단언 없이 안전하게 만든다. */
function asSplit(node: DockNode): DockSplit {
  if (node.type !== "split") {
    throw new Error("expected a split node");
  }
  return node;
}

describe("constants", () => {
  it("matches dc geometry constants", () => {
    expect(DOCK_PANEL_IDS).toEqual([
      "nodeEditor",
      "viewport",
      "inspector",
      "code",
      "assets",
    ]);
    expect(DIVIDER_PX).toBe(6);
    expect(COLLAPSED_STRIP_PX).toBe(34);
    expect(MIN_LEAF_WIDTH).toBe(240);
    expect(MIN_LEAF_HEIGHT).toBe(160);
  });

  it("matches dc computeDrop/dockGhost geometry constants (B4-U1)", () => {
    expect(TAB_BAR_DROP_PX).toBe(34);
    expect(OUTER_DROP_BAND_PX).toBe(42);
    expect(REGION_EDGE_DROP_FRAC).toBe(0.22);
    expect(OUTER_DOCK_RATIO).toBe(0.28);
    expect(REGION_SPLIT_RATIO).toBe(0.4);
    expect(OUTER_PREVIEW_FRAC).toBe(0.32);
  });
});

describe("createDefaultDockTree", () => {
  it("builds the App Shell first-screen tree with a col middle split", () => {
    const tree = createDefaultDockTree();
    expect(tree).toEqual({
      type: "split",
      dir: "col",
      ratio: 0.717,
      a: {
        type: "split",
        dir: "row",
        ratio: 0.587,
        a: {
          type: "leaf",
          id: "l1",
          tabs: ["nodeEditor"],
          active: "nodeEditor",
        },
        b: {
          type: "split",
          dir: "col",
          ratio: 0.556,
          a: {
            type: "leaf",
            id: "l2",
            tabs: ["viewport"],
            active: "viewport",
          },
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
    });
  });

  it("returns a fresh object on every call", () => {
    const first = createDefaultDockTree();
    const second = createDefaultDockTree();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it("round-trips through JSON (R9 persistence readiness)", () => {
    const tree = createDefaultDockTree();
    const roundTripped = JSON.parse(JSON.stringify(tree));
    expect(roundTripped).toEqual(tree);
  });
});

describe("getNodeAt", () => {
  it("returns the root for an empty path", () => {
    const tree = createDefaultDockTree();
    expect(getNodeAt(tree, [])).toBe(tree);
  });

  it("resolves a valid path to the viewport leaf", () => {
    const tree = createDefaultDockTree();
    const node = getNodeAt(tree, ["a", "b", "a"]);
    expect(node).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["viewport"],
      active: "viewport",
    });
  });

  it("returns null when the path descends past a leaf", () => {
    const tree = createDefaultDockTree();
    expect(getNodeAt(tree, ["a", "a", "a"])).toBeNull();
  });
});

describe("setNodeAt", () => {
  it("replaces only the targeted node, preserving sibling references", () => {
    const tree = createDefaultDockTree();
    const originalTop = asSplit(tree);
    const originalMiddle = asSplit(originalTop.a);
    const originalCode = originalTop.b;
    const originalSideLeaf = asSplit(originalMiddle.b).b;

    const replacement: DockLeaf = {
      type: "leaf",
      id: "l2",
      tabs: ["viewport"],
      active: "viewport",
      collapsed: true,
    };
    const next = setNodeAt(tree, ["a", "b", "a"], replacement);

    expect(next).not.toBe(tree);
    expect(getNodeAt(next, ["a", "b", "a"])).toEqual(replacement);
    // sibling subtree (l3 / inspector,assets) keeps the exact same reference
    const nextMiddle = asSplit(asSplit(next).a).b;
    expect(asSplit(nextMiddle).b).toBe(originalSideLeaf);
    // the untouched bottom code leaf keeps the exact same reference
    expect(asSplit(next).b).toBe(originalCode);
    // original tree is unchanged
    expect(getNodeAt(tree, ["a", "b", "a"])).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["viewport"],
      active: "viewport",
    });
  });

  it("returns the value itself for an empty path", () => {
    const tree = createDefaultDockTree();
    const replacement: DockLeaf = {
      type: "leaf",
      id: "solo",
      tabs: ["code"],
      active: "code",
    };
    expect(setNodeAt(tree, [], replacement)).toBe(replacement);
  });

  it("leaves the tree structurally unchanged for an invalid path", () => {
    const tree = createDefaultDockTree();
    const originalCode = asSplit(tree).b;
    const replacement: DockNode = {
      type: "leaf",
      id: "x",
      tabs: ["code"],
      active: "code",
    };
    // ["a", "a", "a"] descends past leaf l1 (root.a.a) — the recursion's
    // `node.type !== "split"` guard returns that leaf as-is, so the value
    // is discarded; ancestor splits still get re-wrapped (new top-level
    // object) but every untouched branch keeps its original reference.
    const next = setNodeAt(tree, ["a", "a", "a"], replacement);
    expect(next).toEqual(tree);
    expect(asSplit(next).b).toBe(originalCode);
  });
});

describe("collectPanelIds", () => {
  it("collects all 5 panels from the default tree in in-order", () => {
    const tree = createDefaultDockTree();
    expect(collectPanelIds(tree)).toEqual([
      "nodeEditor",
      "viewport",
      "inspector",
      "assets",
      "code",
    ]);
  });

  it("returns an empty array for null", () => {
    expect(collectPanelIds(null)).toEqual([]);
  });
});

describe("findLeafPath", () => {
  it("finds the inspector/assets leaf", () => {
    const tree = createDefaultDockTree();
    expect(findLeafPath(tree, "l3")).toEqual(["a", "b", "b"]);
  });

  it("returns null for an id that is not in the tree", () => {
    const tree = createDefaultDockTree();
    expect(findLeafPath(tree, "does-not-exist")).toBeNull();
  });

  it("returns null for a null tree", () => {
    expect(findLeafPath(null, "l1")).toBeNull();
  });
});

describe("findTabLeafPath", () => {
  it("finds the leaf carrying the inspector tab", () => {
    const tree = createDefaultDockTree();
    expect(findTabLeafPath(tree, "inspector")).toEqual(["a", "b", "b"]);
  });

  it("finds the leaf carrying the nodeEditor tab", () => {
    const tree = createDefaultDockTree();
    expect(findTabLeafPath(tree, "nodeEditor")).toEqual(["a", "a"]);
  });

  it("finds the leaf carrying the code tab", () => {
    const tree = createDefaultDockTree();
    expect(findTabLeafPath(tree, "code")).toEqual(["b"]);
  });

  it("returns null for a null tree", () => {
    expect(findTabLeafPath(null, "inspector")).toBeNull();
  });

  it("returns null when the panel isn't docked anywhere", () => {
    const tree = createDefaultDockTree();
    const removed = removePanel(tree, "inspector");
    expect(findTabLeafPath(removed.node, "inspector")).toBeNull();
  });
});

describe("firstLeafPath", () => {
  it("returns the in-order first leaf of the default tree", () => {
    const tree = createDefaultDockTree();
    expect(firstLeafPath(tree)).toEqual(["a", "a"]);
  });

  it("returns an empty path for a single-leaf tree", () => {
    const leaf: DockLeaf = {
      type: "leaf",
      id: "solo",
      tabs: ["code"],
      active: "code",
    };
    expect(firstLeafPath(leaf)).toEqual([]);
  });

  it("returns null for a null tree", () => {
    expect(firstLeafPath(null)).toBeNull();
  });
});

describe("removePanel", () => {
  it("removes the active tab at index 0, falling back to the new tabs[0]", () => {
    const leaf: DockLeaf = {
      type: "leaf",
      id: "l3",
      tabs: ["inspector", "assets"],
      active: "inspector",
    };
    const result = removePanel(leaf, "inspector");
    expect(result.found).toBe(true);
    expect(result.node).toEqual({
      type: "leaf",
      id: "l3",
      tabs: ["assets"],
      active: "assets",
    });
  });

  it("removes a middle active tab, falling back to the left neighbor by original index", () => {
    // original tabs index of "assets" is 1 → fallback index max(0, 1-1) = 0
    // → newTabs[0] = "inspector" (the original left neighbor, not the
    // post-removal left neighbor — dc indexes into the *original* tabs).
    const leaf: DockLeaf = {
      type: "leaf",
      id: "artificial",
      tabs: ["inspector", "assets", "code"],
      active: "assets",
    };
    const result = removePanel(leaf, "assets");
    expect(result.found).toBe(true);
    expect(result.node).toEqual({
      type: "leaf",
      id: "artificial",
      tabs: ["inspector", "code"],
      active: "inspector",
    });
  });

  it("leaves active unchanged when a non-active tab is removed", () => {
    const leaf: DockLeaf = {
      type: "leaf",
      id: "l3",
      tabs: ["inspector", "assets"],
      active: "inspector",
    };
    const result = removePanel(leaf, "assets");
    expect(result.found).toBe(true);
    expect(result.node).toEqual({
      type: "leaf",
      id: "l3",
      tabs: ["inspector"],
      active: "inspector",
    });
  });

  it("collapses a mid-tree leaf's parent split into the sibling when removing the last panel in that leaf (nodeEditor)", () => {
    const tree = createDefaultDockTree();
    const result = removePanel(tree, "nodeEditor");
    expect(result.found).toBe(true);
    // the top row split (l1 | middle col split) collapses to its sibling b
    // (the middle col split), so root.a is now that col split directly.
    expect(result.node).toEqual({
      type: "split",
      dir: "col",
      ratio: 0.717,
      a: {
        type: "split",
        dir: "col",
        ratio: 0.556,
        a: { type: "leaf", id: "l2", tabs: ["viewport"], active: "viewport" },
        b: {
          type: "leaf",
          id: "l3",
          tabs: ["inspector", "assets"],
          active: "inspector",
        },
      },
      b: {
        type: "leaf",
        id: "l4",
        tabs: ["code"],
        active: "code",
        collapsed: false,
      },
    });
  });

  it("collapses the root split into its sibling when removing the last panel in the other root branch (code)", () => {
    const tree = createDefaultDockTree();
    const result = removePanel(tree, "code");
    expect(result.found).toBe(true);
    // root (a: top row split | b: code leaf) collapses to its sibling a
    // (the top row split), so the returned node *is* the former root.a.
    expect(result.node).toEqual({
      type: "split",
      dir: "row",
      ratio: 0.587,
      a: { type: "leaf", id: "l1", tabs: ["nodeEditor"], active: "nodeEditor" },
      b: {
        type: "split",
        dir: "col",
        ratio: 0.556,
        a: { type: "leaf", id: "l2", tabs: ["viewport"], active: "viewport" },
        b: {
          type: "leaf",
          id: "l3",
          tabs: ["inspector", "assets"],
          active: "inspector",
        },
      },
    });
  });

  it("removes the last tab of a single-leaf tree, returning a null node", () => {
    const leaf: DockLeaf = {
      type: "leaf",
      id: "solo",
      tabs: ["code"],
      active: "code",
    };
    expect(removePanel(leaf, "code")).toEqual({ node: null, found: true });
  });

  it("returns the original node by reference when the id is not in the tree", () => {
    // a tree that simply never docks "code" anywhere.
    const tree: DockNode = {
      type: "split",
      dir: "row",
      ratio: 0.5,
      a: { type: "leaf", id: "l1", tabs: ["nodeEditor"], active: "nodeEditor" },
      b: { type: "leaf", id: "l2", tabs: ["viewport"], active: "viewport" },
    };
    const result = removePanel(tree, "code");
    expect(result).toEqual({ node: tree, found: false });
    expect(result.node).toBe(tree);
  });

  it("leaves the original tree unchanged (structural snapshot)", () => {
    const tree = createDefaultDockTree();
    const snapshot = createDefaultDockTree();
    removePanel(tree, "nodeEditor");
    removePanel(tree, "code");
    removePanel(tree, "inspector");
    expect(tree).toEqual(snapshot);
  });

  it("returns not-found for a null node", () => {
    expect(removePanel(null, "code")).toEqual({ node: null, found: false });
  });
});

describe("layoutDockTree — R3 기본 트리 = 현행 앱 첫 화면 동치", () => {
  it("lays out the default tree at 1440×826 into the 4 App Shell regions", () => {
    // 검산 근거(dc BW=1440, BH=826=900-툴바48-상태바26):
    //   588 = round((826-6) × 0.717)              — root col split(상/하)
    //   842 = round((1440-6) × 0.587)              ≡ 이전 고정 레이아웃 스토어의
    //                                                 leftFrac(1.42/2.42≈0.587)
    //   324 = round((588-6) × 0.556)                ≡ 이전 고정 레이아웃 스토어의
    //                                                 viewportFrac(1.25/2.25≈0.556, 높이 비율)
    //   232 = 826 - 588 - 6                          ≡ 이전 고정 레이아웃 스토어의
    //                                                 codeHeight(232)
    const { regions, dividers } = layoutDockTree(
      createDefaultDockTree(),
      1440,
      826,
    );

    const expectedRegions: DockRegion[] = [
      {
        leaf: {
          type: "leaf",
          id: "l1",
          tabs: ["nodeEditor"],
          active: "nodeEditor",
        },
        x: 0,
        y: 0,
        w: 842,
        h: 588,
        path: ["a", "a"],
      },
      {
        leaf: {
          type: "leaf",
          id: "l2",
          tabs: ["viewport"],
          active: "viewport",
        },
        x: 848,
        y: 0,
        w: 592,
        h: 324,
        path: ["a", "b", "a"],
      },
      {
        leaf: {
          type: "leaf",
          id: "l3",
          tabs: ["inspector", "assets"],
          active: "inspector",
        },
        x: 848,
        y: 330,
        w: 592,
        h: 258,
        path: ["a", "b", "b"],
      },
      {
        // ≡ codeHeight 232 — code region은 하단 전폭 독(x=0, w=1440 = BW 전체)
        leaf: {
          type: "leaf",
          id: "l4",
          tabs: ["code"],
          active: "code",
          collapsed: false,
        },
        x: 0,
        y: 594,
        w: 1440,
        h: 232,
        path: ["b"],
      },
    ];
    expect(regions).toEqual(expectedRegions);

    // 순서는 구현의 실제 순회 순서(post-order: a 재귀 → b 재귀 → 자신의
    // divider push) 그대로 단언한다 — 가장 안쪽 split(middle col, path
    // ["a","b"])이 먼저 push되고, 그다음 top row split(path ["a"]), 마지막에
    // root(path [])가 push된다.
    const expectedDividers: DockDivider[] = [
      {
        dir: "col",
        x: 848,
        y: 324,
        w: 592,
        h: 6,
        path: ["a", "b"],
        ratio: 0.556,
        spanW: 592,
        spanH: 588,
      },
      {
        dir: "row",
        x: 842,
        y: 0,
        w: 6,
        h: 588,
        path: ["a"],
        ratio: 0.587,
        spanW: 1440,
        spanH: 588,
      },
      {
        dir: "col",
        x: 0,
        y: 588,
        w: 1440,
        h: 6,
        path: [],
        ratio: 0.717,
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
  it("collapses the bottom code leaf into a 34px strip and disables the root divider", () => {
    const root = asSplit(createDefaultDockTree());
    const codeLeaf = root.b as DockLeaf;
    const tree: DockNode = { ...root, b: { ...codeLeaf, collapsed: true } };

    const { regions, dividers } = layoutDockTree(tree, 1440, 826);

    // ah(상단 부분) = 826 - 6 - 34 = 786 — 그 전체가 root.a 서브트리에 전파되어
    // row split을 거쳐 그대로 nodeEditor leaf의 h가 된다(row 방향은 h를 쪼개지 않음).
    const nodeEditor = regions.find((r) => r.leaf.id === "l1");
    expect(nodeEditor).toMatchObject({ h: 786 });

    const code = regions.find((r) => r.leaf.id === "l4");
    expect(code).toMatchObject({ x: 0, y: 792, w: 1440, h: 34 });

    // 루트 divider(path 길이 0)는 push되지 않는다 — 접힌 쪽이 있으면 그
    // split의 divider는 비활성.
    expect(dividers.some((d) => d.path.length === 0)).toBe(false);
    expect(dividers).toHaveLength(2);
  });

  it("collapses the viewport leaf (a-side) into a 34px strip, symmetric to the b-side case", () => {
    const root = asSplit(createDefaultDockTree());
    const middle = asSplit(root.a);
    const middleSplit = asSplit(middle.b);
    const viewportLeaf = middleSplit.a as DockLeaf;
    const tree: DockNode = {
      ...root,
      a: {
        ...middle,
        b: { ...middleSplit, a: { ...viewportLeaf, collapsed: true } },
      },
    };

    const { regions, dividers } = layoutDockTree(tree, 1440, 826);

    const viewport = regions.find((r) => r.leaf.id === "l2");
    expect(viewport).toMatchObject({ x: 848, y: 0, w: 592, h: 34 });

    const inspector = regions.find((r) => r.leaf.id === "l3");
    expect(inspector).toMatchObject({ x: 848, y: 40, w: 592, h: 548 });

    // 그 split(path ["a","b"])의 divider만 비활성 — 조상(root/top row)의
    // divider는 직계 leaf 자식이 아니므로 그대로 유지된다.
    expect(dividers.some((d) => d.path.join("") === "ab")).toBe(false);
    expect(dividers.some((d) => d.path.length === 0)).toBe(true);
    expect(dividers.some((d) => d.path.join("") === "a")).toBe(true);
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
    // 원본 수식(L420-424) 그대로, 이 함수가 임의로 추가한 가드가 아니다.
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

/** `regionTarget`/`outerTarget` 헬퍼용 — 타입 자체를 값처럼 재사용하기
 * 위한 얇은 래퍼(RegionDropZone/OuterDropSide/DockDropTarget/DockPath를
 * 실제로 소비해 insertDetachedLeaf 테스트의 타깃 리터럴 반복을 줄인다). */
function regionTarget(zone: RegionDropZone, path: DockPath): DockDropTarget {
  return { kind: "region", zone, path };
}
function outerTarget(side: OuterDropSide): DockDropTarget {
  return { kind: "outer", side };
}

describe("computeDropTarget — B4-U1 (dc computeDrop L442-464)", () => {
  const { regions } = layoutDockTree(createDefaultDockTree(), 1440, 826);
  // l1(nodeEditor)  x0,y0,w842,h588    path ["a","a"]
  // l2(viewport)    x848,y0,w592,h324  path ["a","b","a"]
  // l3(inspector/assets) x848,y330,w592,h258 path ["a","b","b"]
  // l4(code)        x0,y594,w1440,h232 path ["b"]

  it("prefers the region tab bar zone over the outer band (top-left corner, y=10 x=10)", () => {
    const hit = computeDropTarget(10, 10, 1440, 826, regions);
    expect(hit).toEqual({
      target: { kind: "region", zone: "center", path: ["a", "a"] },
      preview: { x: 0, y: 0, w: 842, h: 32 },
      label: "Add to tab bar",
    });
  });

  it("docks to the outer left band", () => {
    const hit: DropHit | null = computeDropTarget(20, 400, 1440, 826, regions);
    const preview: DropPreviewRect = {
      x: 0,
      y: 0,
      w: 1440 * OUTER_PREVIEW_FRAC,
      h: 826,
    };
    expect(hit).toEqual({
      target: outerTarget("left"),
      preview,
      label: "Dock left",
    });
  });

  it("docks to the outer right band", () => {
    const hit = computeDropTarget(1420, 400, 1440, 826, regions);
    expect(hit).toEqual({
      target: outerTarget("right"),
      preview: {
        x: 1440 * (1 - OUTER_PREVIEW_FRAC),
        y: 0,
        w: 1440 * OUTER_PREVIEW_FRAC,
        h: 826,
      },
      label: "Dock right",
    });
  });

  it("docks to the outer top band", () => {
    const hit = computeDropTarget(400, 38, 1440, 826, regions);
    expect(hit).toEqual({
      target: outerTarget("top"),
      preview: { x: 0, y: 0, w: 1440, h: 826 * OUTER_PREVIEW_FRAC },
      label: "Dock top",
    });
  });

  it("docks to the outer bottom band", () => {
    const hit = computeDropTarget(400, 800, 1440, 826, regions);
    expect(hit).toEqual({
      target: outerTarget("bottom"),
      preview: {
        x: 0,
        y: 826 * (1 - OUTER_PREVIEW_FRAC),
        w: 1440,
        h: 826 * OUTER_PREVIEW_FRAC,
      },
      label: "Dock bottom",
    });
  });

  it("splits the region's left 22% edge zone (l3, fx=0.1 fy=0.5)", () => {
    const hit = computeDropTarget(907.2, 459, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("left", ["a", "b", "b"]),
      preview: { x: 848, y: 330, w: 296, h: 258 },
      label: "Split left",
    });
  });

  it("splits the region's right 22% edge zone (l3, fx=0.9 fy=0.5)", () => {
    const hit = computeDropTarget(1380.8, 459, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("right", ["a", "b", "b"]),
      preview: { x: 1144, y: 330, w: 296, h: 258 },
      label: "Split right",
    });
  });

  it("splits the region's top 22% edge zone (l3, fx=0.5 fy=0.15, below the 34px tab bar)", () => {
    const hit = computeDropTarget(1144, 368.7, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("top", ["a", "b", "b"]),
      preview: { x: 848, y: 330, w: 592, h: 129 },
      label: "Split top",
    });
  });

  it("splits the region's bottom 22% edge zone (l3, fx=0.5 fy=0.85)", () => {
    const hit = computeDropTarget(1144, 549.3, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("bottom", ["a", "b", "b"]),
      preview: { x: 848, y: 459, w: 592, h: 129 },
      label: "Split bottom",
    });
  });

  it("merges as a tab at the region center (l3, fx=fy=0.5, m=0.5 > 0.22)", () => {
    const hit = computeDropTarget(1144, 459, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("center", ["a", "b", "b"]),
      preview: { x: 848, y: 330, w: 592, h: 258 },
      label: "Add as tab",
    });
  });

  it("returns null outside every region and outside the outer band (the 6px divider gap between l1 and l2/l3)", () => {
    expect(computeDropTarget(845, 400, 1440, 826, regions)).toBeNull();
  });

  it("resolves an exact left/top corner tie in favor of left (dc L459-462 checks dl before dt)", () => {
    // synthetic square region, offset from every container edge by more
    // than OUTER_DROP_BAND_PX so the outer-band branches can't fire, and
    // offset from its own top by more than TAB_BAR_DROP_PX so the tab-bar
    // branch can't fire either — isolates the m===dl vs m===dt tie.
    const tieRegions: DockRegion[] = [
      {
        leaf: { type: "leaf", id: "solo", tabs: ["code"], active: "code" },
        x: 400,
        y: 400,
        w: 200,
        h: 200,
        path: [],
      },
    ];
    // fx = (440-400)/200 = 0.2, fy = (440-400)/200 = 0.2 — identical
    // subtraction/division on both axes, guaranteed bit-exact fx===fy.
    const hit = computeDropTarget(440, 440, 1000, 1000, tieRegions);
    expect(hit).toEqual({
      target: regionTarget("left", []),
      preview: { x: 400, y: 400, w: 100, h: 200 },
      label: "Split left",
    });
  });
});

describe("fallbackDropTarget — B4-U1 (dc _fallbackTarget L429-432, R1)", () => {
  it("falls back to the first region's center when regions exist", () => {
    const { regions } = layoutDockTree(createDefaultDockTree(), 1440, 826);
    expect(fallbackDropTarget(regions)).toEqual({
      kind: "region",
      zone: "center",
      path: ["a", "a"],
    });
  });

  it("falls back to empty when there are no regions — never a resting floating state", () => {
    expect(fallbackDropTarget([])).toEqual({ kind: "empty" });
  });
});

describe("insertDetachedLeaf — B4-U1 (dc dockGhost L466-487)", () => {
  const leaf: DockLeaf = {
    type: "leaf",
    id: "new",
    tabs: ["assets"],
    active: "assets",
  };

  it("makes the leaf the root when the tree is null", () => {
    expect(insertDetachedLeaf(null, { kind: "empty" }, leaf)).toEqual(leaf);
  });

  it("makes the leaf the root when the target is empty, even with a non-null tree", () => {
    const tree = createDefaultDockTree();
    expect(insertDetachedLeaf(tree, { kind: "empty" }, leaf)).toEqual(leaf);
  });

  it("wraps the tree in an outer-left split — new leaf is a (ratio 0.28), tree is b (0.72)", () => {
    const tree = createDefaultDockTree();
    const next = insertDetachedLeaf(tree, outerTarget("left"), leaf);
    expect(next).toEqual({
      type: "split",
      dir: "row",
      ratio: OUTER_DOCK_RATIO,
      a: leaf,
      b: tree,
    });
    expect(asSplit(next).b).toBe(tree);
  });

  it("wraps the tree in an outer-right split — tree is a (ratio 0.72), new leaf is b", () => {
    const tree = createDefaultDockTree();
    const next = insertDetachedLeaf(tree, outerTarget("right"), leaf);
    expect(next).toEqual({
      type: "split",
      dir: "row",
      ratio: 1 - OUTER_DOCK_RATIO,
      a: tree,
      b: leaf,
    });
    expect(asSplit(next).a).toBe(tree);
  });

  it("wraps the tree in an outer-top split — col dir, new leaf is a (ratio 0.28)", () => {
    const tree = createDefaultDockTree();
    const next = insertDetachedLeaf(tree, outerTarget("top"), leaf);
    expect(next).toEqual({
      type: "split",
      dir: "col",
      ratio: OUTER_DOCK_RATIO,
      a: leaf,
      b: tree,
    });
  });

  it("wraps the tree in an outer-bottom split — col dir, tree is a (ratio 0.72)", () => {
    const tree = createDefaultDockTree();
    const next = insertDetachedLeaf(tree, outerTarget("bottom"), leaf);
    expect(next).toEqual({
      type: "split",
      dir: "col",
      ratio: 1 - OUTER_DOCK_RATIO,
      a: tree,
      b: leaf,
    });
  });

  it("merges into a region-center target: appends tabs, sets active to the new leaf's, keeps sibling subtrees by reference", () => {
    const tree = createDefaultDockTree();
    const originalCode = asSplit(tree).b;
    const originalNodeEditor = asSplit(asSplit(tree).a).a;
    const path: DockPath = ["a", "b", "b"]; // l3: inspector/assets
    // mergeLeaf carries a tab ("code") not already on l3 — dc dockGhost
    // does not dedupe (tabs: [...node.tabs, ...g.tabs]), so a leaf
    // carrying a tab id already present elsewhere in the tree is a valid
    // (if unusual) input to this pure function; the caller is responsible
    // for having removed that id from its previous leaf beforehand.
    const mergeLeaf: DockLeaf = {
      type: "leaf",
      id: "new",
      tabs: ["code"],
      active: "code",
    };
    const next = insertDetachedLeaf(
      tree,
      regionTarget("center", path),
      mergeLeaf,
    );

    expect(getNodeAt(next, path)).toEqual({
      type: "leaf",
      id: "l3",
      tabs: ["inspector", "assets", "code"],
      active: "code",
    });
    // sibling subtrees keep the exact same reference (structural sharing).
    expect(asSplit(next).b).toBe(originalCode);
    expect(asSplit(asSplit(next).a).a).toBe(originalNodeEditor);
  });

  it("splits a region-left target: new leaf is a (ratio 0.4), the region node is b (0.6)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["a", "b", "a"]; // l2: viewport
    const originalViewport = getNodeAt(tree, path);
    const next = insertDetachedLeaf(tree, regionTarget("left", path), leaf);
    expect(getNodeAt(next, path)).toEqual({
      type: "split",
      dir: "row",
      ratio: REGION_SPLIT_RATIO,
      a: leaf,
      b: originalViewport,
    });
  });

  it("splits a region-right target: the region node is a (ratio 0.6), new leaf is b", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["a", "b", "a"]; // l2: viewport
    const originalViewport = getNodeAt(tree, path);
    const next = insertDetachedLeaf(tree, regionTarget("right", path), leaf);
    expect(getNodeAt(next, path)).toEqual({
      type: "split",
      dir: "row",
      ratio: 1 - REGION_SPLIT_RATIO,
      a: originalViewport,
      b: leaf,
    });
  });

  it("splits a region-top target: col dir, new leaf is a (ratio 0.4)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["a", "b", "b"]; // l3: inspector/assets
    const originalLeaf = getNodeAt(tree, path);
    const next = insertDetachedLeaf(tree, regionTarget("top", path), leaf);
    expect(getNodeAt(next, path)).toEqual({
      type: "split",
      dir: "col",
      ratio: REGION_SPLIT_RATIO,
      a: leaf,
      b: originalLeaf,
    });
  });

  it("splits a region-bottom target: col dir, the region node is a (ratio 0.6)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["a", "b", "b"]; // l3: inspector/assets
    const originalLeaf = getNodeAt(tree, path);
    const next = insertDetachedLeaf(tree, regionTarget("bottom", path), leaf);
    expect(getNodeAt(next, path)).toEqual({
      type: "split",
      dir: "col",
      ratio: 1 - REGION_SPLIT_RATIO,
      a: originalLeaf,
      b: leaf,
    });
  });

  it("returns the original tree unchanged when a center target's path points at a split node (defensive guard, not a dc case)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["a", "b"]; // the viewport|inspector-assets split
    const next = insertDetachedLeaf(tree, regionTarget("center", path), leaf);
    expect(next).toBe(tree);
  });

  it("returns the original tree unchanged when a split target's path resolves to nothing (defensive guard, not a dc case)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["a", "a", "a"]; // descends past leaf l1
    const next = insertDetachedLeaf(tree, regionTarget("left", path), leaf);
    expect(next).toBe(tree);
  });
});

describe("dockPathsEqual — B4-U1 (dc _samePath L333)", () => {
  it("returns true for equal paths, including two empty paths", () => {
    expect(dockPathsEqual([], [])).toBe(true);
    expect(dockPathsEqual(["a", "b", "a"], ["a", "b", "a"])).toBe(true);
  });

  it("returns false for a different length or a differing step", () => {
    expect(dockPathsEqual(["a"], ["a", "b"])).toBe(false);
    expect(dockPathsEqual(["a", "b"], ["a", "a"])).toBe(false);
  });
});

describe("sanitizeDockLayoutSnapshot — R9 (B6-U1, CHANGELOG §v1.4 R9)", () => {
  const validTree = createDefaultDockTree();

  it("passes a valid snapshot through and returns a reconstructed object", () => {
    const raw = { version: 1, tree: validTree, maximized: null, nextLeafId: 5 };
    const result = sanitizeDockLayoutSnapshot(raw);
    expect(result).toEqual(raw);
    expect(result).not.toBe(raw);
  });

  it("accepts tree: null as a valid empty-state snapshot", () => {
    const raw = { version: 1, tree: null, maximized: null, nextLeafId: 5 };
    expect(sanitizeDockLayoutSnapshot(raw)).toEqual(raw);
  });

  it("rejects a version mismatch, non-object, or array input", () => {
    expect(
      sanitizeDockLayoutSnapshot({
        version: 2,
        tree: null,
        maximized: null,
        nextLeafId: 5,
      }),
    ).toBeNull();
    expect(sanitizeDockLayoutSnapshot(null)).toBeNull();
    expect(sanitizeDockLayoutSnapshot("not an object")).toBeNull();
    expect(sanitizeDockLayoutSnapshot([1, 2, 3])).toBeNull();
  });

  it("rejects an unknown tab id anywhere in the tree", () => {
    const raw = {
      version: 1,
      tree: {
        type: "leaf",
        id: "l1",
        tabs: ["nodeEditor", "bogus"],
        active: "nodeEditor",
      },
      maximized: null,
      nextLeafId: 5,
    };
    expect(sanitizeDockLayoutSnapshot(raw)).toBeNull();
  });

  it("rejects a panel id duplicated across two different leaves", () => {
    const raw = {
      version: 1,
      tree: {
        type: "split",
        dir: "row",
        ratio: 0.5,
        a: { type: "leaf", id: "l1", tabs: ["viewport"], active: "viewport" },
        b: { type: "leaf", id: "l2", tabs: ["viewport"], active: "viewport" },
      },
      maximized: null,
      nextLeafId: 5,
    };
    expect(sanitizeDockLayoutSnapshot(raw)).toBeNull();
  });

  it("rejects a leaf with a duplicate tab within itself", () => {
    const raw = {
      version: 1,
      tree: {
        type: "leaf",
        id: "l1",
        tabs: ["inspector", "inspector"],
        active: "inspector",
      },
      maximized: null,
      nextLeafId: 5,
    };
    expect(sanitizeDockLayoutSnapshot(raw)).toBeNull();
  });

  it("rejects active not being one of the leaf's own tabs", () => {
    const raw = {
      version: 1,
      tree: {
        type: "leaf",
        id: "l1",
        tabs: ["inspector", "assets"],
        active: "code",
      },
      maximized: null,
      nextLeafId: 5,
    };
    expect(sanitizeDockLayoutSnapshot(raw)).toBeNull();
  });

  it("rejects a split ratio of 0, 1, NaN, or a non-number", () => {
    const withRatio = (ratio: unknown) => ({
      version: 1,
      tree: {
        type: "split",
        dir: "row",
        ratio,
        a: { type: "leaf", id: "l1", tabs: ["viewport"], active: "viewport" },
        b: {
          type: "leaf",
          id: "l2",
          tabs: ["inspector"],
          active: "inspector",
        },
      },
      maximized: null,
      nextLeafId: 5,
    });
    expect(sanitizeDockLayoutSnapshot(withRatio(0))).toBeNull();
    expect(sanitizeDockLayoutSnapshot(withRatio(1))).toBeNull();
    expect(sanitizeDockLayoutSnapshot(withRatio(Number.NaN))).toBeNull();
    expect(sanitizeDockLayoutSnapshot(withRatio("0.5"))).toBeNull();
  });

  it("rejects a leaf whose collapsed field is a non-boolean", () => {
    const raw = {
      version: 1,
      tree: {
        type: "leaf",
        id: "l1",
        tabs: ["code"],
        active: "code",
        collapsed: "yes",
      },
      maximized: null,
      nextLeafId: 5,
    };
    expect(sanitizeDockLayoutSnapshot(raw)).toBeNull();
  });

  it("normalizes a maximized leaf id absent from the tree to null (snapshot stays valid)", () => {
    const raw = {
      version: 1,
      tree: validTree,
      maximized: "l99",
      nextLeafId: 5,
    };
    const result = sanitizeDockLayoutSnapshot(raw);
    expect(result).not.toBeNull();
    expect(result?.maximized).toBeNull();
  });

  it("rejects a non-string, non-null maximized value", () => {
    const raw = { version: 1, tree: validTree, maximized: 42, nextLeafId: 5 };
    expect(sanitizeDockLayoutSnapshot(raw)).toBeNull();
  });

  it("normalizes nextLeafId up to maxSuffix+1 when it undercounts, and rejects non-integers", () => {
    const treeWithL5: DockNode = {
      type: "leaf",
      id: "l5",
      tabs: ["code"],
      active: "code",
    };
    const raw = {
      version: 1,
      tree: treeWithL5,
      maximized: null,
      nextLeafId: 3,
    };
    const result = sanitizeDockLayoutSnapshot(raw);
    expect(result?.nextLeafId).toBe(6); // maxSuffix(5) + 1

    expect(sanitizeDockLayoutSnapshot({ ...raw, nextLeafId: 1.5 })).toBeNull();
    expect(sanitizeDockLayoutSnapshot({ ...raw, nextLeafId: "5" })).toBeNull();
    expect(sanitizeDockLayoutSnapshot({ ...raw, nextLeafId: 0 })).toBeNull();
  });

  it("returns a new object with surplus properties stripped at every level", () => {
    const raw = {
      version: 1,
      tree: {
        type: "leaf",
        id: "l1",
        tabs: ["code"],
        active: "code",
        extra: "should be dropped",
      },
      maximized: null,
      nextLeafId: 5,
      surplus: "should be dropped",
    };
    const result = sanitizeDockLayoutSnapshot(raw);
    expect(result).not.toBeNull();
    expect(result).not.toBe(raw);
    expect(result?.tree).not.toBe(raw.tree);
    expect(result).toEqual({
      version: 1,
      tree: { type: "leaf", id: "l1", tabs: ["code"], active: "code" },
      maximized: null,
      nextLeafId: 5,
    });
    const tree = result?.tree as DockLeaf;
    expect(tree).not.toHaveProperty("extra");
    const snapshot: DockLayoutSnapshot = result as DockLayoutSnapshot;
    expect(snapshot).not.toHaveProperty("surplus");
  });
});
