import { describe, expect, it } from "vitest";
import {
  computeDropTarget,
  type DockDropTarget,
  type DropHit,
  type DropPreviewRect,
  dockPathsEqual,
  fallbackDropTarget,
  insertDetachedLeaf,
  OUTER_DOCK_RATIO,
  OUTER_PREVIEW_FRAC,
  type OuterDropSide,
  REGION_SPLIT_RATIO,
  type RegionDropZone,
} from "./drop";
import { type DockRegion, layoutDockTree } from "./geometry";
import { asSplit } from "./testDockTree";
import {
  collectPanelIds,
  createDefaultDockTree,
  DOCK_PANEL_IDS,
  type DockLeaf,
  type DockPath,
  getNodeAt,
  removePanel,
  setNodeAt,
} from "./tree";

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

  it("expands a collapsed center-merge target — the dropped tab must not vanish behind the 34px rail", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["b", "b", "b"]; // l2: inspector/assets
    const collapsedTree = setNodeAt(tree, path, {
      type: "leaf",
      id: "l2",
      tabs: ["inspector", "assets"],
      active: "inspector",
      collapsed: true,
    });
    const mergeLeaf: DockLeaf = {
      type: "leaf",
      id: "new",
      tabs: ["nodeEditor"],
      active: "nodeEditor",
    };

    const next = insertDetachedLeaf(
      collapsedTree,
      regionTarget("center", path),
      mergeLeaf,
    );

    expect(getNodeAt(next, path)).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["inspector", "assets", "nodeEditor"],
      active: "nodeEditor",
      collapsed: false,
    });
  });

  it("does not introduce a `collapsed` key on a target that never had one (conditional spread)", () => {
    const tree = createDefaultDockTree();
    const path: DockPath = ["b", "b", "b"]; // l2 has no `collapsed` key
    const next = insertDetachedLeaf(tree, regionTarget("center", path), {
      type: "leaf",
      id: "new",
      tabs: ["nodeEditor"],
      active: "nodeEditor",
    });
    const merged = getNodeAt(next, path);
    if (merged === null) throw new Error("expected the merged leaf");

    expect(Object.keys(merged)).not.toContain("collapsed");
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
