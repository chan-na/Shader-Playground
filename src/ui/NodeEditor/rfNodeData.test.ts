import { describe, expect, it } from "vitest";
import type {
  GroupGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import { GROUP_COLLAPSED_HEIGHT } from "../../core/graph/types";
import {
  addedCardSize,
  createNodeDataCache,
  groupBoxHeight,
  offscreenPanTarget,
  pendingAddedIds,
} from "./rfNodeData";

function paramNode(id: string): ParamGraphNode {
  return { id, kind: "param", paramKind: "float", value: 0 };
}

describe("groupBoxHeight", () => {
  const group = (patch: Partial<GroupGraphNode> = {}): GroupGraphNode => ({
    id: "g1",
    kind: "group",
    label: "G",
    width: 400,
    height: 300,
    ...patch,
  });

  it("returns the stored height for an expanded group", () => {
    expect(groupBoxHeight(group())).toBe(300);
    expect(groupBoxHeight(group({ collapsed: false }))).toBe(300);
  });

  it("returns the header height for a collapsed group", () => {
    // [#37] The drop-target math used the stored `height` for the node being
    // dragged, so a collapsed group's "center" sat ~135px below its visible
    // 30px header and reparented against whatever was under that empty point.
    expect(groupBoxHeight(group({ collapsed: true }))).toBe(
      GROUP_COLLAPSED_HEIGHT,
    );
  });

  it("ignores the stored height entirely while collapsed", () => {
    expect(groupBoxHeight(group({ collapsed: true, height: 2000 }))).toBe(
      GROUP_COLLAPSED_HEIGHT,
    );
  });
});

describe("offscreenPanTarget", () => {
  // 1000×600 of flow space starting at the origin.
  const view = { x: 0, y: 0, width: 1000, height: 600 };
  const card = (x: number, y: number) => ({ x, y, width: 180, height: 64 });

  it("returns null when nothing was added", () => {
    expect(offscreenPanTarget(view, [])).toBeNull();
  });

  it("returns null for a node fully inside the viewport", () => {
    // [#38] The whole point of dropping the per-edit refit was that the
    // viewport stops moving while the user works — an add in plain sight must
    // not move it either.
    expect(offscreenPanTarget(view, [card(400, 200)])).toBeNull();
  });

  it("returns null for a node only partly on screen", () => {
    // 20px of the card pokes over the left edge: still visible feedback.
    expect(offscreenPanTarget(view, [card(-160, 200)])).toBeNull();
  });

  it("treats a node touching the edge exactly as off-screen", () => {
    // Right edge at x=0 shares no area with the viewport.
    expect(offscreenPanTarget(view, [card(-180, 200)])).toEqual({
      x: -90,
      y: 232,
    });
  });

  it("centers a node that sits past the right edge", () => {
    expect(offscreenPanTarget(view, [card(4000, 0)])).toEqual({
      x: 4090,
      y: 32,
    });
  });

  it("measures against a panned viewport, not the flow origin", () => {
    // The user panned to (6000, 6000); the fixed add coordinate near the flow
    // origin is what lands off-screen.
    const panned = { x: 5800, y: 5800, width: 1000, height: 600 };
    expect(offscreenPanTarget(panned, [card(-200, 200)])).toEqual({
      x: -110,
      y: 232,
    });
    expect(offscreenPanTarget(panned, [card(6000, 6000)])).toBeNull();
  });

  it("stays put when any one of several added nodes is visible", () => {
    expect(
      offscreenPanTarget(view, [card(4000, 0), card(100, 100)]),
    ).toBeNull();
  });

  it("centers the union of a batch that is entirely off-screen", () => {
    // Union spans x 4000..4380, y 0..364 → center (4190, 182).
    expect(offscreenPanTarget(view, [card(4000, 0), card(4200, 300)])).toEqual({
      x: 4190,
      y: 182,
    });
  });

  it("frames the first node when the batch is larger than the viewport", () => {
    // Union is 3180 wide against a 1000-wide viewport: its center would show
    // the empty gap between the two nodes instead of either node.
    expect(offscreenPanTarget(view, [card(4000, 0), card(7000, 0)])).toEqual({
      x: 4090,
      y: 32,
    });
  });

  it("frames the first node when the batch is taller than the viewport", () => {
    expect(offscreenPanTarget(view, [card(4000, 0), card(4000, 2000)])).toEqual(
      { x: 4090, y: 32 },
    );
  });

  it("keeps a real-sized card visible where a 64px stand-in reads off-screen", () => {
    // The band the stand-in box gets wrong: an Image card added at (-200, 200)
    // is 148×162, so with the view starting at y=300 its bottom 62px are on
    // screen — but the 180×64 stand-in ends at y=264, entirely above the view.
    // Deciding on the stand-in pans away from a node the user can already see.
    const panned = { x: -223, y: 300, width: 640, height: 792 };
    const real = { x: -200, y: 200, width: 148, height: 162 };
    const standIn = { x: -200, y: 200, width: 180, height: 64 };
    expect(offscreenPanTarget(panned, [real])).toBeNull();
    expect(offscreenPanTarget(panned, [standIn])).not.toBeNull();
  });
});

describe("addedCardSize", () => {
  const fallback = { width: 180, height: 64 };
  const dom = { width: 148, height: 162 };

  it("prefers React Flow's measurement once it exists", () => {
    expect(addedCardSize({ width: 200, height: 90 }, dom, fallback)).toEqual({
      width: 200,
      height: 90,
    });
  });

  it("reads the mounted element while measured is still empty", () => {
    // The always-taken path on the frame a card mounts: React Flow fills
    // `measured` from a ResizeObserver, which the browser delivers after the
    // frame's rAF callbacks — i.e. after the pan decision has been made.
    expect(addedCardSize({}, dom, fallback)).toEqual(dom);
  });

  it("reads the element when only one dimension was measured", () => {
    expect(addedCardSize({ width: 200 }, dom, fallback)).toEqual(dom);
    expect(addedCardSize({ height: 90 }, dom, fallback)).toEqual(dom);
  });

  it("skips a zero measurement rather than treating it as a real box", () => {
    expect(addedCardSize({ width: 0, height: 0 }, dom, fallback)).toEqual(dom);
  });

  it("falls back to the stand-in when there is no element", () => {
    expect(addedCardSize({}, null, fallback)).toEqual(fallback);
  });

  it("falls back to the stand-in for an element with no layout box", () => {
    // display:none / not laid out yet — offsetWidth/Height read 0.
    expect(addedCardSize({}, { width: 0, height: 0 }, fallback)).toEqual(
      fallback,
    );
  });
});

describe("pendingAddedIds", () => {
  const set = (...ids: string[]) => new Set(ids);

  it("returns the ids this commit added", () => {
    expect(pendingAddedIds([], set("a"), set("a", "b"))).toEqual(["b"]);
  });

  it("returns nothing when the node set is unchanged", () => {
    expect(pendingAddedIds([], set("a", "b"), set("a", "b"))).toEqual([]);
  });

  it("spots an add that keeps the node count the same", () => {
    // Remove one, add one: comparing counts would see nothing happen.
    expect(pendingAddedIds([], set("a", "b"), set("a", "c"))).toEqual(["c"]);
  });

  it("carries a still-undecided add through an unrelated commit", () => {
    // The regression this exists for: the pan is armed as a single frame, and
    // any commit landing before it fires cancels that frame. The added id has
    // to survive into the next run — the set difference there is empty, since
    // the node was already present in the previous render.
    expect(pendingAddedIds(["b"], set("a", "b"), set("a", "b"))).toEqual(["b"]);
  });

  it("does not duplicate an id that is pending and added again", () => {
    expect(pendingAddedIds(["b"], set("a"), set("a", "b"))).toEqual(["b"]);
  });

  it("drops a pending id whose node was removed before the decision", () => {
    // Panning to a node that no longer renders would park the canvas on an
    // empty point.
    expect(pendingAddedIds(["b"], set("a", "b"), set("a"))).toEqual([]);
  });

  it("accumulates adds from several undecided commits", () => {
    expect(pendingAddedIds(["b"], set("a", "b"), set("a", "b", "c"))).toEqual([
      "b",
      "c",
    ]);
  });
});

describe("createNodeDataCache", () => {
  it("wraps a node as { node }", () => {
    const dataFor = createNodeDataCache();
    const n = paramNode("p1");
    expect(dataFor(n)).toEqual({ node: n });
    expect(dataFor(n).node).toBe(n);
  });

  it("returns the same data reference for the same node object", () => {
    const dataFor = createNodeDataCache();
    const n = paramNode("p1");
    const first = dataFor(n);
    const second = dataFor(n);
    // Stable identity is the whole point: React Flow skips re-render when
    // `data` keeps its reference across renders.
    expect(second).toBe(first);
  });

  it("returns a new data reference when the node object is replaced", () => {
    const dataFor = createNodeDataCache();
    const n1 = paramNode("p1");
    const n2: ParamGraphNode = { ...n1, value: 42 };
    const first = dataFor(n1);
    const second = dataFor(n2);
    expect(second).not.toBe(first);
    expect(second.node).toBe(n2);
  });

  it("keeps a stable node's wrapper stable even after other nodes change", () => {
    const dataFor = createNodeDataCache();
    const stable = paramNode("p1");
    const before = dataFor(stable);
    // A different node cycling through does not disturb `stable`'s wrapper.
    const other1: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {},
    };
    dataFor(other1);
    dataFor({ ...other1, fragmentSource: "changed" });
    expect(dataFor(stable)).toBe(before);
  });

  it("tracks multiple nodes independently", () => {
    const dataFor = createNodeDataCache();
    const a = paramNode("a");
    const b = paramNode("b");
    const dataA = dataFor(a);
    const dataB = dataFor(b);
    expect(dataA).not.toBe(dataB);
    expect(dataFor(a)).toBe(dataA);
    expect(dataFor(b)).toBe(dataB);
  });
});
