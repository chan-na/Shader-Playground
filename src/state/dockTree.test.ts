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
  firstMergeableLeafPath,
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
  it("builds the v2.0 App Shell first-screen tree (row 0.25 [code | row 0.60 [nodeEditor | col 0.52 [viewport / inspector+assets]]])", () => {
    const tree = createDefaultDockTree();
    expect(tree).toEqual({
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
        a: {
          type: "leaf",
          id: "l3",
          tabs: ["nodeEditor"],
          active: "nodeEditor",
        },
        b: {
          type: "split",
          dir: "col",
          ratio: 0.52,
          a: {
            type: "leaf",
            id: "l1",
            tabs: ["viewport"],
            active: "viewport",
          },
          b: {
            type: "leaf",
            id: "l2",
            tabs: ["inspector", "assets"],
            active: "inspector",
          },
        },
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
    const node = getNodeAt(tree, ["b", "b", "a"]);
    expect(node).toEqual({
      type: "leaf",
      id: "l1",
      tabs: ["viewport"],
      active: "viewport",
    });
  });

  it("returns null when the path descends past a leaf", () => {
    const tree = createDefaultDockTree();
    // root.a is the code leaf — a further step past it is invalid.
    expect(getNodeAt(tree, ["a", "a"])).toBeNull();
  });
});

describe("setNodeAt", () => {
  it("replaces only the targeted node, preserving sibling references", () => {
    const tree = createDefaultDockTree();
    const originalRoot = asSplit(tree);
    const originalCode = originalRoot.a;
    const originalInner = asSplit(originalRoot.b);
    const originalNodeEditor = originalInner.a;
    const originalColSplit = asSplit(originalInner.b);
    const originalSideLeaf = originalColSplit.b;

    const replacement: DockLeaf = {
      type: "leaf",
      id: "l1",
      tabs: ["viewport"],
      active: "viewport",
      collapsed: true,
    };
    const next = setNodeAt(tree, ["b", "b", "a"], replacement);

    expect(next).not.toBe(tree);
    expect(getNodeAt(next, ["b", "b", "a"])).toEqual(replacement);
    // sibling subtree (l2 / inspector,assets) keeps the exact same reference
    const nextColSplit = asSplit(asSplit(next).b).b;
    expect(asSplit(nextColSplit).b).toBe(originalSideLeaf);
    // the untouched left code leaf keeps the exact same reference
    expect(asSplit(next).a).toBe(originalCode);
    // the untouched nodeEditor leaf keeps the exact same reference
    expect(asSplit(asSplit(next).b).a).toBe(originalNodeEditor);
    // original tree is unchanged
    expect(getNodeAt(tree, ["b", "b", "a"])).toEqual({
      type: "leaf",
      id: "l1",
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
    const originalInner = asSplit(tree).b;
    const replacement: DockNode = {
      type: "leaf",
      id: "x",
      tabs: ["code"],
      active: "code",
    };
    // ["a", "a"] descends past leaf l4 (root.a, the code leaf) — the
    // recursion's `node.type !== "split"` guard returns that leaf as-is, so
    // the value is discarded; ancestor splits still get re-wrapped (new
    // top-level object) but every untouched branch keeps its original
    // reference.
    const next = setNodeAt(tree, ["a", "a"], replacement);
    expect(next).toEqual(tree);
    expect(asSplit(next).b).toBe(originalInner);
  });
});

describe("collectPanelIds", () => {
  it("collects all 5 panels from the default tree in in-order", () => {
    const tree = createDefaultDockTree();
    expect(collectPanelIds(tree)).toEqual([
      "code",
      "nodeEditor",
      "viewport",
      "inspector",
      "assets",
    ]);
  });

  it("returns an empty array for null", () => {
    expect(collectPanelIds(null)).toEqual([]);
  });
});

describe("findLeafPath", () => {
  it("finds the inspector/assets leaf", () => {
    const tree = createDefaultDockTree();
    expect(findLeafPath(tree, "l2")).toEqual(["b", "b", "b"]);
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
    expect(findTabLeafPath(tree, "inspector")).toEqual(["b", "b", "b"]);
  });

  it("finds the leaf carrying the nodeEditor tab", () => {
    const tree = createDefaultDockTree();
    expect(findTabLeafPath(tree, "nodeEditor")).toEqual(["b", "a"]);
  });

  it("finds the leaf carrying the code tab", () => {
    const tree = createDefaultDockTree();
    expect(findTabLeafPath(tree, "code")).toEqual(["a"]);
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

describe("firstMergeableLeafPath — S5/T1 (v2.0, replaces firstLeafPath)", () => {
  it("skips the exclusive code leaf and lands on the nodeEditor leaf for assets (default tree)", () => {
    // root.a (l4, code) fails canMergeDockTabs(["code"], ["assets"]) since
    // the union contains the exclusive kind "code" and neither side is a
    // solo match — the walk continues into root.b.a (l3, nodeEditor), which
    // merges fine (no exclusive kind involved at all).
    const tree = createDefaultDockTree();
    expect(firstMergeableLeafPath(tree, "assets")).toEqual(["b", "a"]);
  });

  it("returns null when every leaf in the tree fails T1 for the given id (tree built entirely of code leaves, id=viewport)", () => {
    // Any leaf merge involving "viewport" always contains the exclusive
    // kind "viewport" in the union — it only passes if the leaf's tabs are
    // already exactly ["viewport"], which none of these are.
    const tree: DockNode = {
      type: "split",
      dir: "row",
      ratio: 0.5,
      a: { type: "leaf", id: "x1", tabs: ["code"], active: "code" },
      b: { type: "leaf", id: "x2", tabs: ["code"], active: "code" },
    };
    expect(firstMergeableLeafPath(tree, "viewport")).toBeNull();
  });

  it("returns an empty path for a single-leaf tree when the merge is allowed (non-exclusive kinds)", () => {
    const leaf: DockLeaf = {
      type: "leaf",
      id: "solo",
      tabs: ["nodeEditor"],
      active: "nodeEditor",
    };
    expect(firstMergeableLeafPath(leaf, "inspector")).toEqual([]);
  });

  it("returns null for a null tree", () => {
    expect(firstMergeableLeafPath(null, "code")).toBeNull();
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
    // the inner row split (nodeEditor | col split) collapses to its sibling
    // b (the col split), so root.b is now that col split directly.
    expect(result.node).toEqual({
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
    });
  });

  it("collapses the root split into its sibling when removing the last panel in the other root branch (code)", () => {
    const tree = createDefaultDockTree();
    const result = removePanel(tree, "code");
    expect(result.found).toBe(true);
    // root (a: code leaf | b: inner row split) collapses to its sibling b
    // (the inner row split), so the returned node *is* the former root.b.
    expect(result.node).toEqual({
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
  // l4(code)             x0,y0,w359,h826     path ["a"]
  // l3(nodeEditor)        x365,y0,w641,h826   path ["b","a"]
  // l1(viewport)          x1012,y0,w428,h426  path ["b","b","a"]
  // l2(inspector/assets)  x1012,y432,w428,h394 path ["b","b","b"]

  it("prefers the region tab bar zone over the outer band (top-left corner, y=10 x=10)", () => {
    const hit = computeDropTarget(10, 10, 1440, 826, regions);
    expect(hit).toEqual({
      target: { kind: "region", zone: "center", path: ["a"] },
      preview: { x: 0, y: 0, w: 359, h: 32 },
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

  it("splits the region's left 22% edge zone (l2, fx=0.1 fy=0.5)", () => {
    const hit = computeDropTarget(1054.8, 629, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("left", ["b", "b", "b"]),
      preview: { x: 1012, y: 432, w: 214, h: 394 },
      label: "Split left",
    });
  });

  it("splits the region's right 22% edge zone (l2, fx=0.9 fy=0.5)", () => {
    const hit = computeDropTarget(1397.2, 629, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("right", ["b", "b", "b"]),
      preview: { x: 1226, y: 432, w: 214, h: 394 },
      label: "Split right",
    });
  });

  it("splits the region's top 22% edge zone (l2, fx=0.5 fy=0.15, below the 34px tab bar)", () => {
    const hit = computeDropTarget(1226, 491.1, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("top", ["b", "b", "b"]),
      preview: { x: 1012, y: 432, w: 428, h: 197 },
      label: "Split top",
    });
  });

  it("splits the region's bottom 22% edge zone (l2, fx=0.5 fy=0.85)", () => {
    const hit = computeDropTarget(1226, 766.9, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("bottom", ["b", "b", "b"]),
      preview: { x: 1012, y: 629, w: 428, h: 197 },
      label: "Split bottom",
    });
  });

  it("merges as a tab at the region center (l2, fx=fy=0.5, m=0.5 > 0.22)", () => {
    const hit = computeDropTarget(1226, 629, 1440, 826, regions);
    expect(hit).toEqual({
      target: regionTarget("center", ["b", "b", "b"]),
      preview: { x: 1012, y: 432, w: 428, h: 394 },
      label: "Add as tab",
    });
  });

  it("returns null outside every region and outside the outer band (the 6px divider gap between the Node Editor and the right column)", () => {
    expect(computeDropTarget(1009, 400, 1440, 826, regions)).toBeNull();
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
      path: ["a"],
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
    const originalCode = asSplit(tree).a;
    const originalNodeEditor = asSplit(asSplit(tree).b).a;
    const path: DockPath = ["b", "b", "b"]; // l2: inspector/assets
    // mergeLeaf carries a tab ("nodeEditor", non-exclusive under T1) not
    // already on l2 — dc dockGhost does not dedupe (tabs: [...node.tabs,
    // ...g.tabs]), so a leaf carrying a tab id already present elsewhere in
    // the tree is a valid (if unusual) input to this pure function; the
    // caller is responsible for having removed that id from its previous
    // leaf beforehand. (Using "code" here instead would trip the T1 gate
    // below and split instead of merge — that case has its own test.)
    const mergeLeaf: DockLeaf = {
      type: "leaf",
      id: "new",
      tabs: ["nodeEditor"],
      active: "nodeEditor",
    };
    const next = insertDetachedLeaf(
      tree,
      regionTarget("center", path),
      mergeLeaf,
    );

    expect(getNodeAt(next, path)).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["inspector", "assets", "nodeEditor"],
      active: "nodeEditor",
    });
    // sibling subtrees keep the exact same reference (structural sharing).
    expect(asSplit(next).a).toBe(originalCode);
    expect(asSplit(asSplit(next).b).a).toBe(originalNodeEditor);
  });

  describe("T1 (S5, v2.0) — viewport/code are excluded from heterogeneous center merges", () => {
    it("(a) still merges a non-exclusive tab (inspector) into the nodeEditor leaf — existing merge behavior preserved", () => {
      const tree = createDefaultDockTree();
      const path: DockPath = ["b", "a"]; // l3: nodeEditor
      const mergeLeaf: DockLeaf = {
        type: "leaf",
        id: "new",
        tabs: ["inspector"],
        active: "inspector",
      };
      const next = insertDetachedLeaf(
        tree,
        regionTarget("center", path),
        mergeLeaf,
      );
      expect(getNodeAt(next, path)).toEqual({
        type: "leaf",
        id: "l3",
        tabs: ["nodeEditor", "inspector"],
        active: "inspector",
      });
    });

    it("(b) dropping viewport onto the code leaf's center falls back to a right-split instead of merging — the code leaf's tabs stay untouched and no panel is lost", () => {
      const originalTree = createDefaultDockTree();
      const originalCodeLeaf = getNodeAt(originalTree, ["a"]);
      // Simulate the real store flow: the viewport leaf has already been
      // detached from the tree (detachForDrag) before insertDetachedLeaf is
      // asked to re-dock it — this is the shape insertDetachedLeaf actually
      // receives in practice, so the panel-count assertion below is
      // meaningful (no artificial duplicate "viewport" id).
      const detached = removePanel(originalTree, "viewport");
      expect(detached.found).toBe(true);
      const path: DockPath = ["a"]; // l4: code, unaffected by the detach above
      const viewportLeaf: DockLeaf = {
        type: "leaf",
        id: "new",
        tabs: ["viewport"],
        active: "viewport",
      };
      const next = insertDetachedLeaf(
        detached.node,
        regionTarget("center", path),
        viewportLeaf,
      );

      expect(getNodeAt(next, path)).toEqual({
        type: "split",
        dir: "row",
        ratio: 1 - REGION_SPLIT_RATIO,
        a: originalCodeLeaf,
        b: viewportLeaf,
      });
      // the code leaf itself (now root.a.a) is untouched — no tabs merged in.
      expect(getNodeAt(next, ["a", "a"])).toEqual(originalCodeLeaf);
      // no panel lost or duplicated by the fallback: same 5 ids as the
      // original tree, viewport included exactly once (in its new split leaf).
      expect(collectPanelIds(next)).toHaveLength(
        collectPanelIds(originalTree).length,
      );
      for (const id of DOCK_PANEL_IDS) {
        expect(collectPanelIds(next)).toContain(id);
      }
    });

    it("(c) the same exclusion holds symmetrically when code is the dragged leaf and viewport is the target — right-split fallback, no panel lost", () => {
      const originalTree = createDefaultDockTree();
      const originalViewportLeaf = getNodeAt(originalTree, ["b", "b", "a"]);
      const detached = removePanel(originalTree, "code");
      expect(detached.found).toBe(true);
      // Removing "code" (the sole tab of root.a, the only sibling of
      // root.b) collapses the *entire root* into its former root.b (dc
      // `_removePanel`'s split-collapse rule) — so the viewport leaf that
      // used to live at ["b","b","a"] now lives one level shallower, at
      // ["b","a"], in `detached.node`.
      const path: DockPath = ["b", "a"]; // l1: viewport, post-collapse path
      const codeLeaf: DockLeaf = {
        type: "leaf",
        id: "new",
        tabs: ["code"],
        active: "code",
      };
      const next = insertDetachedLeaf(
        detached.node,
        regionTarget("center", path),
        codeLeaf,
      );

      expect(getNodeAt(next, path)).toEqual({
        type: "split",
        dir: "row",
        ratio: 1 - REGION_SPLIT_RATIO,
        a: originalViewportLeaf,
        b: codeLeaf,
      });
      expect(getNodeAt(next, [...path, "a"])).toEqual(originalViewportLeaf);
      expect(collectPanelIds(next)).toHaveLength(
        collectPanelIds(originalTree).length,
      );
      for (const id of DOCK_PANEL_IDS) {
        expect(collectPanelIds(next)).toContain(id);
      }
    });
  });

  it("splits a region-left target: new leaf is a (ratio 0.4), the region node is b (0.6)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["b", "b", "a"]; // l1: viewport
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
    const path: DockPath = ["b", "b", "a"]; // l1: viewport
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
    const path: DockPath = ["b", "b", "b"]; // l2: inspector/assets
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
    const path: DockPath = ["b", "b", "b"]; // l2: inspector/assets
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
    const path: DockPath = ["b", "b"]; // the viewport|inspector-assets col split
    const next = insertDetachedLeaf(tree, regionTarget("center", path), leaf);
    expect(next).toBe(tree);
  });

  it("returns the original tree unchanged when a split target's path resolves to nothing (defensive guard, not a dc case)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["b", "a", "a"]; // descends past leaf l3 (nodeEditor)
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

describe("sanitizeDockLayoutSnapshot — R9 (B6-U1, CHANGELOG §v1.4 R9 · V4 v2.0)", () => {
  const validTree = createDefaultDockTree();

  it("passes a valid snapshot through and returns a reconstructed object", () => {
    const raw = { version: 2, tree: validTree, maximized: null, nextLeafId: 5 };
    const result = sanitizeDockLayoutSnapshot(raw);
    expect(result).toEqual(raw);
    expect(result).not.toBe(raw);
  });

  it("accepts tree: null as a valid empty-state snapshot", () => {
    const raw = { version: 2, tree: null, maximized: null, nextLeafId: 5 };
    expect(sanitizeDockLayoutSnapshot(raw)).toEqual(raw);
  });

  it("rejects a version mismatch (including the pre-v2.0 version:1 schema), non-object, or array input", () => {
    expect(
      sanitizeDockLayoutSnapshot({
        version: 1,
        tree: null,
        maximized: null,
        nextLeafId: 5,
      }),
    ).toBeNull();
    expect(
      sanitizeDockLayoutSnapshot({
        version: 3,
        tree: null,
        maximized: null,
        nextLeafId: 5,
      }),
    ).toBeNull();
    expect(sanitizeDockLayoutSnapshot(null)).toBeNull();
    expect(sanitizeDockLayoutSnapshot("not an object")).toBeNull();
    expect(sanitizeDockLayoutSnapshot([1, 2, 3])).toBeNull();
  });

  it("V4 (v2.0 quiet fallback): a well-formed pre-v2.0 version:1 snapshot with a real tree is rejected wholesale — no banner, caller falls back to the v2.0 default tree", () => {
    const raw = {
      version: 1,
      tree: validTree,
      maximized: null,
      nextLeafId: 5,
    };
    expect(sanitizeDockLayoutSnapshot(raw)).toBeNull();
  });

  it("rejects an unknown tab id anywhere in the tree", () => {
    const raw = {
      version: 2,
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
      version: 2,
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
      version: 2,
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
      version: 2,
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
      version: 2,
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
      version: 2,
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
      version: 2,
      tree: validTree,
      maximized: "l99",
      nextLeafId: 5,
    };
    const result = sanitizeDockLayoutSnapshot(raw);
    expect(result).not.toBeNull();
    expect(result?.maximized).toBeNull();
  });

  it("rejects a non-string, non-null maximized value", () => {
    const raw = { version: 2, tree: validTree, maximized: 42, nextLeafId: 5 };
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
      version: 2,
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
      version: 2,
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
      version: 2,
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
