import { act, cleanup, render } from "@testing-library/react";
import type {
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  OnBeforeDelete,
} from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphStore } from "../../state/graphStore";
import { DockLeafContext } from "../dock/dockLeafContext";
import { MOTION_MAX_MS } from "../motion";
import { NodeEditor } from "./index";

/**
 * The pan-into-view wiring, exercised through the component that owns it.
 *
 * `rfNodeData.test.ts` covers the rules; this file covers that NodeEditor
 * actually applies them — the part no pure-function test can guard, and the
 * part every regression in this area has been in: *when* a pending add is
 * cleared, which size source is consulted, and whether a decision that could
 * not be made is retried. Reverting index.tsx alone has to fail here.
 *
 * React Flow is stubbed rather than mounted: under jsdom the real one measures
 * nothing (zero-size layout), so a real instance could not answer any of the
 * questions the decision asks. The stub is the instance contract NodeEditor
 * uses — screenToFlowPosition / getInternalNode / getViewport / setCenter —
 * plus the `.react-flow__node[data-id]` elements it looks up by selector.
 */

type InternalNodeStub = {
  hidden?: boolean;
  measured: { width?: number; height?: number };
  internals: { positionAbsolute: { x: number; y: number } };
};

const rf = vi.hoisted(() => ({
  setCenter: vi.fn(),
  fitView: vi.fn(),
  zoom: 1,
  nodes: new Map<string, unknown>(),
  // The delete-path props, captured from the last render so a test can drive
  // them the way React Flow's own delete key handler would.
  beforeDelete: null as OnBeforeDelete | null,
  nodesChange: null as ((changes: NodeChange[]) => void) | null,
  edgesChange: null as ((changes: EdgeChange[]) => void) | null,
}));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createElement, useEffect } = await import("react");
  type StubProps = {
    nodes: ReadonlyArray<{ id: string }>;
    onInit?: (instance: unknown) => void;
    onBeforeDelete?: OnBeforeDelete;
    onNodesChange?: (changes: NodeChange[]) => void;
    onEdgesChange?: (changes: EdgeChange[]) => void;
  };
  const instance = {
    // The identity map keeps the test's px and flow numbers the same, so a
    // stated viewport rect *is* the flow-space view rect.
    screenToFlowPosition: (p: { x: number; y: number }) => p,
    getInternalNode: (id: string) => rf.nodes.get(id),
    getViewport: () => ({ x: 0, y: 0, zoom: rf.zoom }),
    setCenter: rf.setCenter,
    fitView: rf.fitView,
  };
  const ReactFlow = ({
    nodes,
    onInit,
    onBeforeDelete,
    onNodesChange,
    onEdgesChange,
  }: StubProps) => {
    useEffect(() => {
      onInit?.(instance);
    }, [onInit]);
    rf.beforeDelete = onBeforeDelete ?? null;
    rf.nodesChange = onNodesChange ?? null;
    rf.edgesChange = onEdgesChange ?? null;
    return createElement(
      "div",
      { className: "react-flow" },
      nodes.map((n) =>
        createElement("div", {
          key: n.id,
          className: "react-flow__node",
          "data-id": n.id,
        }),
      ),
    );
  };
  return { ...actual, ReactFlow };
});

// jsdom has no rAF queue worth driving and no ResizeObserver at all. Both are
// stubbed so a test can say exactly when the deferred decision runs and when
// the panel gets its box back.
let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextFrameId = 1;
let resizeCallbacks: Array<() => void> = [];

class ResizeObserverStub {
  #callback: () => void;
  constructor(callback: () => void) {
    this.#callback = callback;
  }
  observe(): void {
    resizeCallbacks.push(this.#callback);
  }
  unobserve(): void {}
  disconnect(): void {
    resizeCallbacks = resizeCallbacks.filter((c) => c !== this.#callback);
  }
}

function flushFrames(): void {
  const due = frames;
  frames = [];
  for (const f of due) f.cb(0);
}

function resizePane(): void {
  for (const cb of [...resizeCallbacks]) cb();
  flushFrames();
}

/** jsdom gives NodeEditor neither of the two clocks it schedules against, so
 *  every test in this file installs the same drivable stand-ins. */
function installTimingStubs(): void {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.push({ id, cb });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames = frames.filter((f) => f.id !== id);
  });
  frames = [];
  resizeCallbacks = [];
  rf.beforeDelete = null;
  rf.nodesChange = null;
  rf.edgesChange = null;
}

const VIEW = { x: 0, y: 0, width: 1000, height: 600 };

function paneOf(container: HTMLElement): HTMLElement {
  const pane = container.querySelector(".panel-body");
  if (!(pane instanceof HTMLElement))
    throw new Error("panel-body not rendered");
  return pane;
}

/** A collapsed dock slot hides the panel body with `display: none` — the
 *  element stays mounted and measures 0×0, which is what `size: null` stands
 *  for here. */
function setPaneBox(
  pane: HTMLElement,
  size: { width: number; height: number } | null,
): void {
  const rect = new DOMRect(VIEW.x, VIEW.y, size?.width ?? 0, size?.height ?? 0);
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue(rect);
}

function stubInternal(
  id: string,
  position: { x: number; y: number },
  patch: Partial<InternalNodeStub> = {},
): void {
  rf.nodes.set(id, {
    measured: { width: 180, height: 64 },
    internals: { positionAbsolute: position },
    ...patch,
  });
}

function addParam(id: string, position: { x: number; y: number }): void {
  stubInternal(id, position);
  act(() => {
    useGraphStore
      .getState()
      .addNode({ id, kind: "param", paramKind: "float", value: 0 }, position);
  });
}

function cardFor(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`.react-flow__node[data-id="${id}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`no card for ${id}`);
  return el;
}

function renderEditor(): HTMLElement {
  const { container } = render(
    <DockLeafContext.Provider value={{ leafId: "l3", path: ["b", "a"] }}>
      <NodeEditor />
    </DockLeafContext.Provider>,
  );
  const pane = paneOf(container);
  setPaneBox(pane, { width: VIEW.width, height: VIEW.height });
  // The mount commit itself never decides (there is no "previous" node set to
  // diff against), so nothing is pending at this point.
  flushFrames();
  rf.setCenter.mockClear();
  rf.fitView.mockClear();
  return container;
}

describe("NodeEditor — panning an added node into view", () => {
  beforeEach(() => {
    installTimingStubs();
    rf.nodes.clear();
    rf.setCenter.mockClear();
    rf.fitView.mockClear();
    rf.zoom = 1;
    useGraphStore.getState().reset();
    // One node already on canvas: the decision only ever looks at the ids a
    // commit *added*, which needs a previous set to differ from.
    stubInternal("seed", { x: 100, y: 100 });
    useGraphStore.getState().setGraph(
      {
        nodes: [{ id: "seed", kind: "param", paramKind: "float", value: 0 }],
        edges: [],
      },
      { seed: { x: 100, y: 100 } },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pans to an added node that landed outside the visible area", () => {
    renderEditor();
    addParam("far", { x: 4000, y: 0 });
    flushFrames();
    // Center of the 180×64 card, at the zoom the user left behind — a pan,
    // never a refit [#38].
    expect(rf.setCenter).toHaveBeenCalledWith(4090, 32, {
      zoom: 1,
      duration: MOTION_MAX_MS,
    });
  });

  it("leaves the viewport alone for an add in plain sight", () => {
    renderEditor();
    addParam("near", { x: 400, y: 200 });
    flushFrames();
    expect(rf.setCenter).not.toHaveBeenCalled();
  });

  it("measures the card by its element while React Flow has no measurement", () => {
    // The always-taken path on the frame a card mounts: React Flow fills
    // `measured` from a ResizeObserver, delivered after the frame's rAF
    // callbacks. Deciding on the 180×64 stand-in instead would center (4090,
    // 32) — a box that is not the card.
    const container = renderEditor();
    stubInternal("far", { x: 4000, y: 0 }, { measured: {} });
    act(() => {
      useGraphStore
        .getState()
        .addNode(
          { id: "far", kind: "param", paramKind: "float", value: 0 },
          { x: 4000, y: 0 },
        );
    });
    const card = cardFor(container, "far");
    Object.defineProperty(card, "offsetWidth", {
      value: 148,
      configurable: true,
    });
    Object.defineProperty(card, "offsetHeight", {
      value: 162,
      configurable: true,
    });
    flushFrames();
    expect(rf.setCenter).toHaveBeenCalledWith(4074, 81, {
      zoom: 1,
      duration: MOTION_MAX_MS,
    });
  });

  it("prefers React Flow's measurement over the element once it has one", () => {
    const container = renderEditor();
    stubInternal(
      "far",
      { x: 4000, y: 0 },
      { measured: { width: 200, height: 90 } },
    );
    act(() => {
      useGraphStore
        .getState()
        .addNode(
          { id: "far", kind: "param", paramKind: "float", value: 0 },
          { x: 4000, y: 0 },
        );
    });
    const card = cardFor(container, "far");
    Object.defineProperty(card, "offsetWidth", {
      value: 148,
      configurable: true,
    });
    Object.defineProperty(card, "offsetHeight", {
      value: 162,
      configurable: true,
    });
    flushFrames();
    // 200×90 → (4100, 45); the element's 148×162 would say (4074, 81).
    expect(rf.setCenter).toHaveBeenCalledWith(4100, 45, {
      zoom: 1,
      duration: MOTION_MAX_MS,
    });
  });

  it("still pans when a later commit cancels the armed frame", () => {
    renderEditor();
    addParam("far", { x: 4000, y: 0 });
    // A second commit before the frame fires tears the effect down, cancelling
    // it. The id has to survive into the re-armed frame — the set difference
    // there is empty, since the node was already present.
    act(() => {
      useGraphStore.getState().removeNode("seed");
    });
    flushFrames();
    expect(rf.setCenter).toHaveBeenCalledWith(4090, 32, {
      zoom: 1,
      duration: MOTION_MAX_MS,
    });
  });

  it("retries an add made while the panel was collapsed, once it reopens", () => {
    // A collapsed dock slot keeps the panel mounted and hides it with CSS, so
    // the pane is a live element measuring 0×0 and nothing can be judged
    // against it. Reopening changes neither the node array nor the epoch, so
    // without the pane observer this add would be lost for good.
    const container = renderEditor();
    setPaneBox(paneOf(container), null);
    addParam("far", { x: 4000, y: 0 });
    flushFrames();
    expect(rf.setCenter).not.toHaveBeenCalled();

    setPaneBox(paneOf(container), { width: VIEW.width, height: VIEW.height });
    resizePane();
    expect(rf.setCenter).toHaveBeenCalledWith(4090, 32, {
      zoom: 1,
      duration: MOTION_MAX_MS,
    });
  });

  it("holds an add that renders nowhere until its group is expanded", () => {
    renderEditor();
    stubInternal("far", { x: 4000, y: 0 }, { hidden: true });
    act(() => {
      useGraphStore
        .getState()
        .addNode(
          { id: "far", kind: "param", paramKind: "float", value: 0 },
          { x: 4000, y: 0 },
        );
    });
    flushFrames();
    // Inside a collapsed group the card draws nothing — panning to it would
    // park the canvas on an empty point.
    expect(rf.setCenter).not.toHaveBeenCalled();

    // Expanding rewrites the node array (the group node is replaced), which is
    // the commit that re-runs the decision — by then there is a card to frame.
    stubInternal("far", { x: 4000, y: 0 });
    act(() => {
      useGraphStore.getState().renameNode("seed", "poke");
    });
    flushFrames();
    expect(rf.setCenter).toHaveBeenCalledWith(4090, 32, {
      zoom: 1,
      duration: MOTION_MAX_MS,
    });
  });

  it("frames the newest add rather than an older undecided one", () => {
    // Pending ids outlive their commit now, so an accumulated list would drag a
    // stale id into the union box — and a union wider than the viewport falls
    // back to framing its *first* member, i.e. the oldest id of all.
    const container = renderEditor();
    setPaneBox(paneOf(container), null);
    addParam("older", { x: 4000, y: 0 });
    flushFrames();
    expect(rf.setCenter).not.toHaveBeenCalled();

    setPaneBox(paneOf(container), { width: VIEW.width, height: VIEW.height });
    addParam("newer", { x: 7000, y: 0 });
    flushFrames();
    expect(rf.setCenter).toHaveBeenCalledTimes(1);
    expect(rf.setCenter).toHaveBeenCalledWith(7090, 32, {
      zoom: 1,
      duration: MOTION_MAX_MS,
    });
  });

  it("pans without refitting on a plain add, and refits on a replace", () => {
    // [#38] The auto-fit belongs to wholesale replacements only; a plain add
    // must never re-frame the canvas out from under the user.
    renderEditor();
    addParam("far", { x: 4000, y: 0 });
    flushFrames();
    expect(rf.fitView).not.toHaveBeenCalled();

    stubInternal("fresh", { x: 0, y: 0 });
    act(() => {
      useGraphStore.getState().setGraph(
        {
          nodes: [{ id: "fresh", kind: "param", paramKind: "float", value: 0 }],
          edges: [],
        },
        { fresh: { x: 0, y: 0 } },
      );
    });
    rf.setCenter.mockClear();
    flushFrames();
    expect(rf.fitView).toHaveBeenCalledTimes(1);
    // The replace's own frame is the fit's to draw — both animating at once
    // would fight over the viewport.
    expect(rf.setCenter).not.toHaveBeenCalled();
  });

  it("keeps the user's zoom instead of snapping to setCenter's default", () => {
    rf.zoom = 0.42;
    renderEditor();
    addParam("far", { x: 4000, y: 0 });
    flushFrames();
    expect(rf.setCenter).toHaveBeenCalledWith(4090, 32, {
      zoom: 0.42,
      duration: MOTION_MAX_MS,
    });
  });
});

/**
 * The Delete-key guard for lesson groups.
 *
 * React Flow expands a doomed node into its children and then into every edge
 * touching them, so without `onBeforeDelete` pressing Delete on a group label
 * box also takes the node inside it and that node's wiring — the destructive
 * `removeGroup(id, "delete-children")` action, minus the confirmation
 * GroupInspector demands for it. Every starter graph ships lesson groups now,
 * so this is reachable on first launch.
 *
 * The stub above is the delete path's contract: the props React Flow's own
 * key handler drives — `onBeforeDelete` first, then the surviving removals as
 * edge changes and node changes, in that order (see deleteElements).
 */
describe("NodeEditor — deleting a group from the canvas", () => {
  beforeEach(() => {
    installTimingStubs();
    rf.nodes.clear();
    rf.zoom = 1;
    useGraphStore.getState().reset();
    // A lesson group holding one node, wired to a node outside it — the shape
    // every starter graph boots with. mesh1's stored position is relative to
    // the group, so it sits at (120, 140) in absolute terms.
    useGraphStore.getState().setGraph(
      {
        nodes: [
          {
            id: "grp",
            kind: "group",
            label: "1 · Mesh — 정점 데이터",
            width: 300,
            height: 200,
          },
          { id: "mesh1", kind: "param", paramKind: "float", value: 0 },
          { id: "shader1", kind: "param", paramKind: "float", value: 0 },
        ],
        edges: [
          {
            id: "e1",
            source: "mesh1",
            sourceHandle: "out",
            target: "shader1",
            targetHandle: "in",
          },
        ],
      },
      {
        grp: { x: 100, y: 100 },
        mesh1: { x: 20, y: 40 },
        shader1: { x: 600, y: 100 },
      },
      { mesh1: "grp" },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** What React Flow hands `onBeforeDelete`: the selected nodes already
   *  expanded through `parentId` (@xyflow/system's `parentHit` branch) plus
   *  every edge connected to that expanded set. */
  function candidateNode(
    id: string,
    type: string,
    selected: boolean,
    parentId?: string,
  ): Node {
    const node: Node = {
      id,
      type,
      selected,
      position: { x: 0, y: 0 },
      data: {},
    };
    if (parentId !== undefined) node.parentId = parentId;
    return node;
  }

  const E1: Edge = { id: "e1", source: "mesh1", target: "shader1" };

  /** Run the delete the way React Flow does: ask, then apply what came back
   *  (edge changes before node changes, as `deleteElements` does). */
  async function pressDelete(nodes: Node[], edges: Edge[]): Promise<void> {
    const ask = rf.beforeDelete;
    if (!ask) throw new Error("onBeforeDelete is not wired to ReactFlow");
    const verdict = await ask({ nodes, edges });
    if (typeof verdict === "boolean") {
      throw new Error("expected a filtered set, not a blanket verdict");
    }
    await act(async () => {
      rf.edgesChange?.(
        verdict.edges.map((e): EdgeChange => ({ type: "remove", id: e.id })),
      );
      rf.nodesChange?.(
        verdict.nodes.map((n): NodeChange => ({ type: "remove", id: n.id })),
      );
    });
  }

  it("removes only the group and leaves its child where it was drawn", async () => {
    renderEditor();
    await pressDelete(
      [
        candidateNode("grp", "group", true),
        // Not selected: React Flow added it purely because its parent is going.
        candidateNode("mesh1", "param", false, "grp"),
      ],
      [E1],
    );
    const s = useGraphStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(["mesh1", "shader1"]);
    // Delete on a group means ungroup, so the child's edge survives with it.
    expect(s.edges.map((e) => e.id)).toEqual(["e1"]);
    // Promoted from group-relative (20, 40) to absolute — the card must not
    // jump when the box under it disappears.
    expect(s.positions.mesh1).toEqual({ x: 120, y: 140 });
    expect(s.parents).toEqual({});
  });

  it("still deletes a child the user selected alongside the group", async () => {
    renderEditor();
    await pressDelete(
      [
        candidateNode("grp", "group", true),
        candidateNode("mesh1", "param", true, "grp"),
      ],
      [E1],
    );
    const s = useGraphStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(["shader1"]);
    expect(s.edges).toEqual([]);
  });

  it("leaves a plain node deletion alone, edges included", async () => {
    renderEditor();
    await pressDelete([candidateNode("mesh1", "param", true, "grp")], [E1]);
    const s = useGraphStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(["grp", "shader1"]);
    expect(s.edges).toEqual([]);
  });
});
