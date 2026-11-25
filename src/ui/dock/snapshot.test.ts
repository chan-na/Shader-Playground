import { describe, expect, it } from "vitest";
import {
  type DockLayoutSnapshot,
  sanitizeDockLayoutSnapshot,
} from "./snapshot";
import { createDefaultDockTree, type DockLeaf, type DockNode } from "./tree";

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
