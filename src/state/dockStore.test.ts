import { beforeEach, describe, expect, it } from "vitest";
import { useDockStore } from "./dockStore";
import {
  clampDividerRatio,
  collectPanelIds,
  createDefaultDockTree,
  DOCK_PANEL_IDS,
  type DockDropTarget,
  type DockNode,
  type DockPath,
  getNodeAt,
  OUTER_DOCK_RATIO,
} from "./dockTree";

/** 테스트 전용 순회 헬퍼 — 이전엔 `firstLeafPath`(무조건 첫 leaf)로 이
 * 루프들을 구동했지만, v2.0에서 그 함수는 병합 대상만 찾는
 * `firstMergeableLeafPath`로 대체됐다(S5/T1, addPanel 전용). 여기 테스트들은
 * "병합 가능 여부"와 무관하게 트리를 완전히 비울 때까지(또는 전부
 * detach할 때까지) *아무* leaf나 하나 골라 반복하면 되므로, 옛 동작을 그대로
 * 복제한 모듈-로컬 헬퍼를 둔다(프로덕션 export가 아니므로 knip 대상이
 * 아니다). */
function anyLeafPath(node: DockNode | null): DockPath | null {
  if (node === null) return null;
  if (node.type === "leaf") return [];
  const sub = anyLeafPath(node.a);
  return sub === null ? null : ["a", ...sub];
}

const initial = useDockStore.getState();

beforeEach(() => {
  useDockStore.setState(initial, true);
});

/** getNodeAt은 tree가 non-null임을 요구한다 — 스토어 상태(`tree: DockNode |
 * null`)를 곧장 넘기기 위한 테스트 전용 null-safe 래퍼. */
function nodeAt(tree: DockNode | null, path: DockPath): DockNode | null {
  return tree === null ? null : getNodeAt(tree, path);
}

describe("initial state", () => {
  it("starts with the default dock tree, nothing maximized, nextLeafId 5", () => {
    const s = useDockStore.getState();
    expect(s.tree).toEqual(createDefaultDockTree());
    expect(s.maximized).toBeNull();
    expect(s.nextLeafId).toBe(5);
  });
});

describe("setActiveTab", () => {
  it("switches the active tab of the l2 leaf (inspector/assets)", () => {
    useDockStore.getState().setActiveTab(["b", "b", "b"], "assets");
    const node = nodeAt(useDockStore.getState().tree, ["b", "b", "b"]);
    expect(node).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["inspector", "assets"],
      active: "assets",
    });
  });

  it("is a no-op for an invalid path", () => {
    const before = useDockStore.getState().tree;
    // root.a is the code leaf — a further step past it is invalid.
    useDockStore.getState().setActiveTab(["a", "a"], "assets");
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("is a no-op when the tab isn't hosted by that leaf", () => {
    const before = useDockStore.getState().tree;
    useDockStore.getState().setActiveTab(["b", "b", "b"], "code");
    expect(useDockStore.getState().tree).toBe(before);
  });
});

describe("setDividerRatio", () => {
  it("clamps the root divider ratio via clampDividerRatio", () => {
    useDockStore.getState().setDividerRatio([], 0.1, 1440, 826);
    const expected = clampDividerRatio("row", 1440, 826, 0.1);
    expect(expected).toBeCloseTo(240 / 1434, 5);
    const root = useDockStore.getState().tree;
    expect(root?.type).toBe("split");
    if (root?.type === "split") {
      expect(root.ratio).toBeCloseTo(expected, 10);
    }
  });

  it("is a no-op for a path that isn't a split", () => {
    const before = useDockStore.getState().tree;
    // root.a resolves to the code leaf, not a split.
    useDockStore.getState().setDividerRatio(["a"], 0.1, 1440, 826);
    expect(useDockStore.getState().tree).toBe(before);
  });
});

describe("toggleCollapsed", () => {
  it("round-trips the code leaf's collapsed flag and clears maximized", () => {
    useDockStore.getState().toggleMaximized("l1");
    expect(useDockStore.getState().maximized).toBe("l1");

    useDockStore.getState().toggleCollapsed(["a"]);
    expect(nodeAt(useDockStore.getState().tree, ["a"])).toMatchObject({
      collapsed: true,
    });
    expect(useDockStore.getState().maximized).toBeNull();

    useDockStore.getState().toggleCollapsed(["a"]);
    expect(nodeAt(useDockStore.getState().tree, ["a"])).toMatchObject({
      collapsed: false,
    });
  });

  it("is a no-op for a path that isn't a leaf", () => {
    const before = useDockStore.getState().tree;
    // the root path resolves to the root split itself, not a leaf.
    useDockStore.getState().toggleCollapsed([]);
    expect(useDockStore.getState().tree).toBe(before);
  });
});

describe("setCollapsed", () => {
  it("sets the code leaf (l4) collapsed to true", () => {
    useDockStore.getState().setCollapsed("code", true);
    expect(nodeAt(useDockStore.getState().tree, ["a"])).toMatchObject({
      id: "l4",
      collapsed: true,
    });
  });

  it("is idempotent — a second call with the same value keeps the same tree reference", () => {
    useDockStore.getState().setCollapsed("code", true);
    const after = useDockStore.getState().tree;
    useDockStore.getState().setCollapsed("code", true);
    expect(useDockStore.getState().tree).toBe(after);
  });

  it("restores collapsed to false", () => {
    useDockStore.getState().setCollapsed("code", true);
    useDockStore.getState().setCollapsed("code", false);
    expect(nodeAt(useDockStore.getState().tree, ["a"])).toMatchObject({
      id: "l4",
      collapsed: false,
    });
  });

  it("is a no-op when the tree is null (every panel closed)", () => {
    let path = anyLeafPath(useDockStore.getState().tree);
    let guard = 0;
    while (path !== null && guard < 10) {
      useDockStore.getState().closePanel(path);
      path = anyLeafPath(useDockStore.getState().tree);
      guard += 1;
    }
    expect(useDockStore.getState().tree).toBeNull();

    useDockStore.getState().setCollapsed("code", true);
    expect(useDockStore.getState().tree).toBeNull();
  });

  it("is a no-op when the panel isn't docked (findTabLeafPath returns null)", () => {
    useDockStore.getState().closeTab("code");
    const before = useDockStore.getState().tree;
    useDockStore.getState().setCollapsed("code", true);
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("clears maximized when collapsing the maximized leaf itself (l4 = code)", () => {
    useDockStore.getState().toggleMaximized("l4");
    expect(useDockStore.getState().maximized).toBe("l4");

    useDockStore.getState().setCollapsed("code", true);
    expect(useDockStore.getState().maximized).toBeNull();
  });

  it("preserves maximized when a different leaf is maximized (l3, unlike toggleCollapsed)", () => {
    useDockStore.getState().toggleMaximized("l3");
    expect(useDockStore.getState().maximized).toBe("l3");

    useDockStore.getState().setCollapsed("code", true);
    expect(useDockStore.getState().maximized).toBe("l3");
  });
});

describe("toggleMaximized", () => {
  it("maximizes a leaf, then restores (null) on a second call for the same id", () => {
    useDockStore.getState().toggleMaximized("l1");
    expect(useDockStore.getState().maximized).toBe("l1");
    useDockStore.getState().toggleMaximized("l1");
    expect(useDockStore.getState().maximized).toBeNull();
  });

  it("switches the maximized leaf when called with a different id", () => {
    useDockStore.getState().toggleMaximized("l1");
    useDockStore.getState().toggleMaximized("l2");
    expect(useDockStore.getState().maximized).toBe("l2");
  });

  it("force-expands a collapsed leaf being maximized (legacy layout store parity)", () => {
    useDockStore.getState().toggleCollapsed(["a"]);
    expect(nodeAt(useDockStore.getState().tree, ["a"])).toMatchObject({
      collapsed: true,
    });

    useDockStore.getState().toggleMaximized("l4");
    expect(useDockStore.getState().maximized).toBe("l4");
    expect(nodeAt(useDockStore.getState().tree, ["a"])).toMatchObject({
      collapsed: false,
    });
  });

  it("is a no-op for an id with no matching leaf", () => {
    const before = useDockStore.getState().tree;
    useDockStore.getState().toggleMaximized("does-not-exist");
    expect(useDockStore.getState().tree).toBe(before);
    expect(useDockStore.getState().maximized).toBeNull();
  });
});

describe("closeTab", () => {
  it("removes a non-active tab from the l2 leaf, keeping the leaf alive", () => {
    useDockStore.getState().closeTab("assets");
    expect(nodeAt(useDockStore.getState().tree, ["b", "b", "b"])).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["inspector"],
      active: "inspector",
    });
  });

  it("collapses the tree when the sole tab of a leaf is removed", () => {
    useDockStore.getState().closeTab("nodeEditor");
    const root = useDockStore.getState().tree;
    // the l3/innerRowSplit shrinks away — root.b is now directly the col split
    expect(root?.type).toBe("split");
    if (root?.type === "split") {
      expect(root.b.type).toBe("split");
      if (root.b.type === "split") {
        expect(root.b.dir).toBe("col");
      }
    }
  });

  it("clears maximized when the last tab of the maximized leaf closes", () => {
    useDockStore.getState().toggleMaximized("l3");
    useDockStore.getState().closeTab("nodeEditor");
    expect(useDockStore.getState().maximized).toBeNull();
  });

  it("is a no-op for an id that isn't docked", () => {
    useDockStore.getState().closeTab("assets");
    const before = useDockStore.getState().tree;
    // "assets"는 이미 위에서 닫혔으므로 두 번째 호출은 미보유 id에 대한 no-op이다.
    useDockStore.getState().closeTab("assets");
    expect(useDockStore.getState().tree).toBe(before);
  });
});

describe("closePanel", () => {
  it("closes both tabs of the l2 leaf; viewport inherits its slot", () => {
    useDockStore.getState().closePanel(["b", "b", "b"]);
    const root = useDockStore.getState().tree;
    expect(root).toEqual({
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
        b: { type: "leaf", id: "l1", tabs: ["viewport"], active: "viewport" },
      },
    });
  });

  it("closing every panel in sequence reaches the empty state (tree: null)", () => {
    let path = anyLeafPath(useDockStore.getState().tree);
    let guard = 0;
    while (path !== null && guard < 10) {
      useDockStore.getState().closePanel(path);
      path = anyLeafPath(useDockStore.getState().tree);
      guard += 1;
    }
    expect(useDockStore.getState().tree).toBeNull();
  });
});

describe("addPanel", () => {
  it("re-docks a closed panel by merging into the nodeEditor leaf — T1 skips the exclusive code leaf (l4) even though it's in-order first", () => {
    useDockStore.getState().closeTab("assets");
    useDockStore.getState().addPanel("assets");
    // root.a (l4, code) fails the T1 merge gate (assets ∪ code contains the
    // exclusive "code" kind and neither side is a solo match), so
    // firstMergeableLeafPath walks past it to root.b.a (l3, nodeEditor).
    expect(nodeAt(useDockStore.getState().tree, ["a"])).toEqual({
      type: "leaf",
      id: "l4",
      tabs: ["code"],
      active: "code",
      collapsed: false,
    });
    expect(nodeAt(useDockStore.getState().tree, ["b", "a"])).toEqual({
      type: "leaf",
      id: "l3",
      tabs: ["nodeEditor", "assets"],
      active: "assets",
      collapsed: false,
    });
  });

  it("is a no-op when the panel is already docked", () => {
    const before = useDockStore.getState().tree;
    useDockStore.getState().addPanel("viewport");
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("T1: re-docking viewport finds no mergeable leaf (viewport/code never merge into anything else) and falls back to a new outer-right leaf", () => {
    useDockStore.getState().closeTab("viewport");
    const treeAfterClose = useDockStore.getState().tree;

    useDockStore.getState().addPanel("viewport");

    expect(useDockStore.getState().tree).toEqual({
      type: "split",
      dir: "row",
      ratio: 1 - OUTER_DOCK_RATIO,
      a: treeAfterClose,
      b: { type: "leaf", id: "l5", tabs: ["viewport"], active: "viewport" },
    });
    expect(useDockStore.getState().nextLeafId).toBe(6);
  });

  it("creates a fresh leaf and bumps nextLeafId when the tree is empty", () => {
    let path = anyLeafPath(useDockStore.getState().tree);
    let guard = 0;
    while (path !== null && guard < 10) {
      useDockStore.getState().closePanel(path);
      path = anyLeafPath(useDockStore.getState().tree);
      guard += 1;
    }
    expect(useDockStore.getState().tree).toBeNull();

    useDockStore.getState().addPanel("code");
    expect(useDockStore.getState().tree).toEqual({
      type: "leaf",
      id: "l5",
      tabs: ["code"],
      active: "code",
    });
    expect(useDockStore.getState().nextLeafId).toBe(6);
  });
});

describe("resetLayout", () => {
  it("restores the default tree, clears maximized, resets nextLeafId", () => {
    useDockStore.getState().closeTab("assets");
    useDockStore.getState().toggleMaximized("l1");

    useDockStore.getState().resetLayout();

    expect(useDockStore.getState().tree).toEqual(createDefaultDockTree());
    expect(useDockStore.getState().maximized).toBeNull();
    expect(useDockStore.getState().nextLeafId).toBe(5);
  });
});

describe("detachForDrag", () => {
  it("detaches the entire l2 leaf (inspector+assets) via leaf mode, promoting the sibling l1", () => {
    const result = useDockStore
      .getState()
      .detachForDrag({ mode: "leaf", path: ["b", "b", "b"] });
    expect(result).toEqual({
      tabs: ["inspector", "assets"],
      active: "inspector",
    });
    expect(useDockStore.getState().tree).toEqual({
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
        b: { type: "leaf", id: "l1", tabs: ["viewport"], active: "viewport" },
      },
    });
  });

  it("detaches a single tab via tab mode, leaving the sibling tab on l2", () => {
    const result = useDockStore
      .getState()
      .detachForDrag({ mode: "tab", id: "inspector" });
    expect(result).toEqual({ tabs: ["inspector"], active: "inspector" });
    expect(nodeAt(useDockStore.getState().tree, ["b", "b", "b"])).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["assets"],
      active: "assets",
    });
  });

  it("resets maximized to null on detach, regardless of which leaf was maximized", () => {
    useDockStore.getState().toggleMaximized("l1");
    expect(useDockStore.getState().maximized).toBe("l1");

    useDockStore.getState().detachForDrag({ mode: "tab", id: "assets" });
    expect(useDockStore.getState().maximized).toBeNull();
  });

  it("is a no-op (null result, unchanged tree reference) for an invalid path", () => {
    const before = useDockStore.getState().tree;
    // root.a is the code leaf — a further step past it is invalid.
    const result = useDockStore
      .getState()
      .detachForDrag({ mode: "leaf", path: ["a", "a"] });
    expect(result).toBeNull();
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("is a no-op (null result, unchanged tree reference) for a tab that isn't docked", () => {
    useDockStore.getState().closeTab("assets");
    const before = useDockStore.getState().tree;
    const result = useDockStore
      .getState()
      .detachForDrag({ mode: "tab", id: "assets" });
    expect(result).toBeNull();
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("reaches the empty state (tree: null) when every leaf is detached in sequence", () => {
    let path = anyLeafPath(useDockStore.getState().tree);
    let guard = 0;
    while (path !== null && guard < 10) {
      useDockStore.getState().detachForDrag({ mode: "leaf", path });
      path = anyLeafPath(useDockStore.getState().tree);
      guard += 1;
    }
    expect(useDockStore.getState().tree).toBeNull();
  });
});

describe("dockDetached", () => {
  it("is a no-op for an empty tabs array", () => {
    const before = useDockStore.getState().tree;
    const nextLeafIdBefore = useDockStore.getState().nextLeafId;
    useDockStore.getState().dockDetached([], "inspector", { kind: "empty" });
    expect(useDockStore.getState().tree).toBe(before);
    expect(useDockStore.getState().nextLeafId).toBe(nextLeafIdBefore);
  });

  it("docks outward-left: root becomes a row split (ratio 0.28) with the new leaf as a", () => {
    const originalTree = useDockStore.getState().tree;
    useDockStore
      .getState()
      .dockDetached(["code"], "code", { kind: "outer", side: "left" });
    expect(useDockStore.getState().tree).toEqual({
      type: "split",
      dir: "row",
      ratio: 0.28,
      a: { type: "leaf", id: "l5", tabs: ["code"], active: "code" },
      b: originalTree,
    });
    expect(useDockStore.getState().nextLeafId).toBe(6);
  });

  it("merges into a region center target, updating the leaf's active tab", () => {
    const target: DockDropTarget = {
      kind: "region",
      zone: "center",
      path: ["b", "b", "b"],
    };
    // "inspector" is a non-exclusive kind (T1 only gates viewport/code), so
    // this exercises the plain tab-merge path.
    useDockStore.getState().detachForDrag({ mode: "tab", id: "inspector" });
    useDockStore.getState().dockDetached(["inspector"], "inspector", target);
    expect(nodeAt(useDockStore.getState().tree, ["b", "b", "b"])).toEqual({
      type: "leaf",
      id: "l2",
      tabs: ["assets", "inspector"],
      active: "inspector",
    });
  });

  it("T1: merging code into a region center target that isn't already code-only falls back to a right-split instead (no panel lost)", () => {
    const detached = useDockStore
      .getState()
      .detachForDrag({ mode: "tab", id: "code" });
    expect(detached).toEqual({ tabs: ["code"], active: "code" });
    // Detaching "code" (the sole tab of the root-level l4 leaf) collapses
    // the whole root into its former sibling branch (dc's split-collapse
    // rule) — so l2 (inspector/assets), which lived at ["b","b","b"] in the
    // pre-detach tree, now lives one level shallower at ["b","b"].
    const target: DockDropTarget = {
      kind: "region",
      zone: "center",
      path: ["b", "b"], // l2: inspector/assets, post-collapse path
    };

    useDockStore.getState().dockDetached(["code"], "code", target);

    expect(nodeAt(useDockStore.getState().tree, ["b", "b"])).toEqual({
      type: "split",
      dir: "row",
      ratio: 0.6,
      a: {
        type: "leaf",
        id: "l2",
        tabs: ["inspector", "assets"],
        active: "inspector",
      },
      b: { type: "leaf", id: "l5", tabs: ["code"], active: "code" },
    });
    const ids = collectPanelIds(useDockStore.getState().tree);
    expect(ids).toHaveLength(DOCK_PANEL_IDS.length);
    for (const id of DOCK_PANEL_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("becomes the new root when the tree is empty and the target is {kind: 'empty'}", () => {
    let path = anyLeafPath(useDockStore.getState().tree);
    let guard = 0;
    while (path !== null && guard < 10) {
      useDockStore.getState().closePanel(path);
      path = anyLeafPath(useDockStore.getState().tree);
      guard += 1;
    }
    expect(useDockStore.getState().tree).toBeNull();

    useDockStore
      .getState()
      .dockDetached(["nodeEditor"], "nodeEditor", { kind: "empty" });
    expect(useDockStore.getState().tree).toEqual({
      type: "leaf",
      id: "l5",
      tabs: ["nodeEditor"],
      active: "nodeEditor",
    });
    expect(useDockStore.getState().nextLeafId).toBe(6);
  });

  it("round-trips detachForDrag -> dockDetached without losing any panel (R1)", () => {
    const result = useDockStore
      .getState()
      .detachForDrag({ mode: "leaf", path: ["b", "b", "b"] });
    expect(result).not.toBeNull();
    if (result === null) throw new Error("expected a detach payload");

    useDockStore.getState().dockDetached(result.tabs, result.active, {
      kind: "outer",
      side: "bottom",
    });

    const ids = collectPanelIds(useDockStore.getState().tree);
    expect(ids).toHaveLength(DOCK_PANEL_IDS.length);
    for (const id of DOCK_PANEL_IDS) {
      expect(ids).toContain(id);
    }
  });
});

describe("serialization (R9 readiness)", () => {
  it("round-trips {tree, maximized, nextLeafId} through JSON after several mutations", () => {
    useDockStore.getState().closeTab("assets");
    useDockStore.getState().toggleMaximized("l1");
    useDockStore.getState().toggleCollapsed(["b"]);
    useDockStore.getState().addPanel("assets");

    const { tree, maximized, nextLeafId } = useDockStore.getState();
    const snapshot: {
      tree: DockNode | null;
      maximized: string | null;
      nextLeafId: number;
    } = { tree, maximized, nextLeafId };
    const roundTripped = JSON.parse(JSON.stringify(snapshot));
    expect(roundTripped).toEqual(snapshot);
  });
});
