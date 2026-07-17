import { beforeEach, describe, expect, it } from "vitest";
import { useDockStore } from "./dockStore";
import {
  clampDividerRatio,
  createDefaultDockTree,
  type DockNode,
  type DockPath,
  firstLeafPath,
  getNodeAt,
} from "./dockTree";

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
  it("switches the active tab of the l3 leaf (inspector/assets)", () => {
    useDockStore.getState().setActiveTab(["a", "b", "b"], "assets");
    const node = nodeAt(useDockStore.getState().tree, ["a", "b", "b"]);
    expect(node).toEqual({
      type: "leaf",
      id: "l3",
      tabs: ["inspector", "assets"],
      active: "assets",
    });
  });

  it("is a no-op for an invalid path", () => {
    const before = useDockStore.getState().tree;
    useDockStore.getState().setActiveTab(["a", "a", "a"], "assets");
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("is a no-op when the tab isn't hosted by that leaf", () => {
    const before = useDockStore.getState().tree;
    useDockStore.getState().setActiveTab(["a", "b", "b"], "code");
    expect(useDockStore.getState().tree).toBe(before);
  });
});

describe("setDividerRatio", () => {
  it("clamps the root divider ratio via clampDividerRatio", () => {
    useDockStore.getState().setDividerRatio([], 0.1, 1440, 826);
    const expected = clampDividerRatio("col", 1440, 826, 0.1);
    expect(expected).toBeCloseTo(160 / 820, 5);
    const root = useDockStore.getState().tree;
    expect(root?.type).toBe("split");
    if (root?.type === "split") {
      expect(root.ratio).toBeCloseTo(expected, 10);
    }
  });

  it("is a no-op for a path that isn't a split", () => {
    const before = useDockStore.getState().tree;
    useDockStore.getState().setDividerRatio(["a", "a"], 0.1, 1440, 826);
    expect(useDockStore.getState().tree).toBe(before);
  });
});

describe("toggleCollapsed", () => {
  it("round-trips the code leaf's collapsed flag and clears maximized", () => {
    useDockStore.getState().toggleMaximized("l1");
    expect(useDockStore.getState().maximized).toBe("l1");

    useDockStore.getState().toggleCollapsed(["b"]);
    expect(nodeAt(useDockStore.getState().tree, ["b"])).toMatchObject({
      collapsed: true,
    });
    expect(useDockStore.getState().maximized).toBeNull();

    useDockStore.getState().toggleCollapsed(["b"]);
    expect(nodeAt(useDockStore.getState().tree, ["b"])).toMatchObject({
      collapsed: false,
    });
  });

  it("is a no-op for a path that isn't a leaf", () => {
    const before = useDockStore.getState().tree;
    useDockStore.getState().toggleCollapsed(["a"]);
    expect(useDockStore.getState().tree).toBe(before);
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
    useDockStore.getState().toggleCollapsed(["b"]);
    expect(nodeAt(useDockStore.getState().tree, ["b"])).toMatchObject({
      collapsed: true,
    });

    useDockStore.getState().toggleMaximized("l4");
    expect(useDockStore.getState().maximized).toBe("l4");
    expect(nodeAt(useDockStore.getState().tree, ["b"])).toMatchObject({
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
  it("removes a non-active tab from the l3 leaf, keeping the leaf alive", () => {
    useDockStore.getState().closeTab("assets");
    expect(nodeAt(useDockStore.getState().tree, ["a", "b", "b"])).toEqual({
      type: "leaf",
      id: "l3",
      tabs: ["inspector"],
      active: "inspector",
    });
  });

  it("collapses the tree when the sole tab of a leaf is removed", () => {
    useDockStore.getState().closeTab("nodeEditor");
    const root = useDockStore.getState().tree;
    // the l1/rowSplit shrinks away — root.a is now directly the middle col split
    expect(root?.type).toBe("split");
    if (root?.type === "split") {
      expect(root.a.type).toBe("split");
      if (root.a.type === "split") {
        expect(root.a.dir).toBe("col");
      }
    }
  });

  it("clears maximized when the last tab of the maximized leaf closes", () => {
    useDockStore.getState().toggleMaximized("l1");
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
  it("closes both tabs of the l3 leaf; viewport inherits its slot", () => {
    useDockStore.getState().closePanel(["a", "b", "b"]);
    const root = useDockStore.getState().tree;
    expect(root).toEqual({
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
        b: { type: "leaf", id: "l2", tabs: ["viewport"], active: "viewport" },
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

  it("closing every panel in sequence reaches the empty state (tree: null)", () => {
    let path = firstLeafPath(useDockStore.getState().tree);
    let guard = 0;
    while (path !== null && guard < 10) {
      useDockStore.getState().closePanel(path);
      path = firstLeafPath(useDockStore.getState().tree);
      guard += 1;
    }
    expect(useDockStore.getState().tree).toBeNull();
  });
});

describe("addPanel", () => {
  it("re-docks a closed panel into the first leaf", () => {
    useDockStore.getState().closeTab("assets");
    useDockStore.getState().addPanel("assets");
    expect(nodeAt(useDockStore.getState().tree, ["a", "a"])).toEqual({
      type: "leaf",
      id: "l1",
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

  it("creates a fresh leaf and bumps nextLeafId when the tree is empty", () => {
    let path = firstLeafPath(useDockStore.getState().tree);
    let guard = 0;
    while (path !== null && guard < 10) {
      useDockStore.getState().closePanel(path);
      path = firstLeafPath(useDockStore.getState().tree);
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
