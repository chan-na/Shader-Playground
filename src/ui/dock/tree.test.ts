import { describe, expect, it } from "vitest";
import { asSplit } from "./testDockTree";
import {
  collectPanelIds,
  createDefaultDockTree,
  type DockLeaf,
  type DockNode,
  findLeafPath,
  findTabLeafPath,
  firstMergeableLeafPath,
  getNodeAt,
  removePanel,
  setNodeAt,
} from "./tree";

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
