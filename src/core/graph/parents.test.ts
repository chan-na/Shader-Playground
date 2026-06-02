import { describe, expect, it } from "vitest";
import type { NodePosition } from "../../state/types";
import {
  allDescendants,
  directChildren,
  getAbsolutePosition,
  hasCollapsedAncestor,
  parentDepth,
  relativePositionFor,
  wouldCreateParentCycle,
} from "./parents";
import type { GraphNode } from "./types";

function nodes(...ids: string[]): GraphNode[] {
  return ids.map((id) => ({ id, kind: "output" }) as GraphNode);
}

describe("getAbsolutePosition", () => {
  it("returns position unchanged for top-level", () => {
    const positions: Record<string, NodePosition> = { a: { x: 10, y: 20 } };
    expect(getAbsolutePosition("a", positions, {})).toEqual({ x: 10, y: 20 });
  });

  it("accumulates parent chain", () => {
    const positions: Record<string, NodePosition> = {
      g1: { x: 100, y: 100 },
      g2: { x: 50, y: 50 },
      n: { x: 5, y: 5 },
    };
    const parents = { n: "g2", g2: "g1" };
    expect(getAbsolutePosition("n", positions, parents)).toEqual({
      x: 155,
      y: 155,
    });
  });

  it("returns zero for unknown id", () => {
    expect(getAbsolutePosition("missing", {}, {})).toEqual({ x: 0, y: 0 });
  });

  it("bails out of a self-cycle without infinite loop", () => {
    const positions: Record<string, NodePosition> = { a: { x: 1, y: 1 } };
    const parents = { a: "a" };
    const result = getAbsolutePosition("a", positions, parents);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe("wouldCreateParentCycle", () => {
  it("rejects self-parent", () => {
    expect(wouldCreateParentCycle({}, "a", "a")).toBe(true);
  });

  it("permits unrelated assignment", () => {
    expect(wouldCreateParentCycle({}, "a", "b")).toBe(false);
  });

  it("rejects placing parent under its descendant", () => {
    // g1 → g2 → n; trying to make g1 a child of n would close the loop.
    const parents = { g2: "g1", n: "g2" };
    expect(wouldCreateParentCycle(parents, "g1", "n")).toBe(true);
  });

  it("permits release-to-top-level", () => {
    expect(wouldCreateParentCycle({ a: "g" }, "a", undefined)).toBe(false);
  });

  it("permits same-level reparent", () => {
    // a is currently child of g1; moving to g2 (unrelated) is fine.
    const parents = { a: "g1" };
    expect(wouldCreateParentCycle(parents, "a", "g2")).toBe(false);
  });
});

describe("parentDepth", () => {
  it("is 0 for top-level", () => {
    expect(parentDepth("a", {})).toBe(0);
  });

  it("counts chain length", () => {
    const parents = { a: "g1", g1: "g2" };
    expect(parentDepth("a", parents)).toBe(2);
  });
});

describe("directChildren", () => {
  it("returns only direct children", () => {
    const ns = nodes("g", "a", "b", "c");
    const parents = { a: "g", b: "g", c: "a" };
    const kids = directChildren("g", ns, parents).map((n) => n.id);
    expect(kids.sort()).toEqual(["a", "b"]);
  });

  it("returns empty when parent has no children", () => {
    expect(directChildren("g", nodes("g"), {})).toEqual([]);
  });
});

describe("allDescendants", () => {
  it("returns transitive descendants", () => {
    const ns = nodes("g", "a", "b", "c", "d");
    const parents = { a: "g", b: "g", c: "a", d: "c" };
    const ids = allDescendants("g", ns, parents)
      .map((n) => n.id)
      .sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("returns empty when parent is leaf", () => {
    expect(allDescendants("a", nodes("a"), {})).toEqual([]);
  });
});

describe("relativePositionFor", () => {
  it("returns the target unchanged for top-level", () => {
    const target: NodePosition = { x: 200, y: 300 };
    expect(relativePositionFor(target, undefined, {}, {})).toEqual(target);
  });

  it("subtracts parent absolute position", () => {
    const positions: Record<string, NodePosition> = {
      g: { x: 100, y: 100 },
    };
    expect(relativePositionFor({ x: 250, y: 180 }, "g", positions, {})).toEqual(
      { x: 150, y: 80 },
    );
  });

  it("handles nested parents", () => {
    const positions: Record<string, NodePosition> = {
      g1: { x: 100, y: 100 },
      g2: { x: 30, y: 40 },
    };
    const parents = { g2: "g1" };
    // g2 absolute = (130, 140); target (200, 200) under g2 ⇒ (70, 60).
    expect(
      relativePositionFor({ x: 200, y: 200 }, "g2", positions, parents),
    ).toEqual({ x: 70, y: 60 });
  });
});

describe("hasCollapsedAncestor", () => {
  it("returns true when the direct parent is collapsed", () => {
    expect(hasCollapsedAncestor("a", { a: "g" }, new Set(["g"]))).toBe(true);
  });

  it("returns true when a grandparent is collapsed", () => {
    const parents = { a: "g2", g2: "g1" };
    expect(hasCollapsedAncestor("a", parents, new Set(["g1"]))).toBe(true);
  });

  it("returns false when no ancestor is collapsed", () => {
    const parents = { a: "g2", g2: "g1" };
    expect(hasCollapsedAncestor("a", parents, new Set())).toBe(false);
  });

  it("ignores the node's own id (collapsed group still renders)", () => {
    expect(hasCollapsedAncestor("g", { g: "outer" }, new Set(["g"]))).toBe(
      false,
    );
  });

  it("is robust to a malformed parent cycle", () => {
    // a → b → a loop should not hang; capped at MAX_DEPTH.
    expect(hasCollapsedAncestor("a", { a: "b", b: "a" }, new Set(["z"]))).toBe(
      false,
    );
  });
});
