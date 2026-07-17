import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDockStore } from "../state/dockStore";
import {
  createDefaultDockTree,
  findTabLeafPath,
  firstLeafPath,
} from "../state/dockTree";
import { useDockDragStart } from "./dockDragContext";

// The 4 panel components DockLayout renders are heavy (WebGL canvas,
// CodeMirror, ReactFlow) and already covered by their own test suites —
// stub them so this file only exercises the tree→DOM layout logic. The
// NodeEditor stub additionally consumes `useDockDragStart` (B4-U3) to expose
// a `startTabDrag` trigger button — `dockDragContext` isn't the module being
// mocked here, so importing it directly inside this factory is fine (it
// isn't itself subject to `vi.mock` hoisting rules the way `./NodeEditor`
// is).
vi.mock("./NodeEditor", () => ({
  NodeEditor: () => {
    const drag = useDockDragStart();
    return (
      <div data-testid="stub-node-editor">
        <button
          type="button"
          data-testid="stub-drag-tab"
          onPointerDown={(e) => drag.startTabDrag("nodeEditor", e)}
        />
      </div>
    );
  },
}));
vi.mock("./Viewport", () => ({
  Viewport: () => <div data-testid="stub-viewport" />,
}));
vi.mock("./Panels/SidePanel", () => ({
  SidePanel: () => <div data-testid="stub-side-panel" />,
}));
vi.mock("./CodeEditor", () => ({
  CodeEditor: () => <div data-testid="stub-code-editor" />,
}));

import { DockLayout } from "./DockLayout";

const initial = useDockStore.getState();

beforeEach(() => {
  useDockStore.setState(
    {
      ...initial,
      tree: createDefaultDockTree(),
      maximized: null,
      nextLeafId: 5,
    },
    true,
  );
});

afterEach(() => {
  cleanup();
});

function q(container: HTMLElement, className: string): Element {
  const els = container.getElementsByClassName(className);
  expect(els.length).toBe(1);
  const el = els[0];
  if (el === undefined) throw new Error("unreachable — length checked above");
  return el;
}

describe("DockLayout", () => {
  it("renders the default tree as the 4 legacy leaf slots + 3 separators + all 4 stub panels", () => {
    const { container } = render(<DockLayout />);

    expect(container.getElementsByClassName("shell-left").length).toBe(1);
    expect(container.getElementsByClassName("shell-right-top").length).toBe(1);
    expect(container.getElementsByClassName("shell-right-bottom").length).toBe(
      1,
    );
    expect(container.getElementsByClassName("shell-code").length).toBe(1);
    expect(screen.getAllByRole("separator")).toHaveLength(3);

    expect(screen.getByTestId("stub-node-editor")).not.toBeNull();
    expect(screen.getByTestId("stub-viewport")).not.toBeNull();
    expect(screen.getByTestId("stub-side-panel")).not.toBeNull();
    expect(screen.getByTestId("stub-code-editor")).not.toBeNull();
  });

  it("R4: collapsing the nodeEditor leaf shrinks it to a 34px strip and removes its own divider (2 separators left)", () => {
    const { container } = render(<DockLayout />);

    act(() => {
      useDockStore.getState().toggleCollapsed(["a", "a"]);
    });

    const shellLeft = q(container, "shell-left");
    expect(shellLeft.className).toContain("shell-slot--collapsed");
    expect((shellLeft as HTMLElement).style.flex).toBe("0 0 34px");
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("maximizing a leaf hides its non-ancestor siblings, gives it flex 1, and keeps every panel mounted", () => {
    const { container } = render(<DockLayout />);

    act(() => {
      useDockStore.getState().toggleMaximized("l2"); // viewport leaf
    });

    const shellLeft = q(container, "shell-left");
    const shellRightBottom = q(container, "shell-right-bottom");
    const shellCode = q(container, "shell-code");
    const shellRightTop = q(container, "shell-right-top");

    expect(shellLeft.className).toContain("shell-slot--hidden");
    expect(shellRightBottom.className).toContain("shell-slot--hidden");
    expect(shellCode.className).toContain("shell-slot--hidden");
    expect(shellRightTop.className).not.toContain("shell-slot--hidden");
    // jsdom's CSSOM normalizes the shorthand "1" to its longhand-equivalent
    // serialization "1 1 0%" (flex-grow 1, flex-shrink 1, flex-basis 0%) —
    // the source-of-truth is still the single flex="1" string DockSplitView
    // sets (see the `head === "a" ? "1" : aFlex` branches).
    expect((shellRightTop as HTMLElement).style.flex).toBe("1 1 0%");

    // Unmount-guard invariant: even the hidden siblings' panel components
    // stay mounted (display:none via CSS only).
    expect(screen.getByTestId("stub-node-editor")).not.toBeNull();
    expect(screen.getByTestId("stub-viewport")).not.toBeNull();
    expect(screen.getByTestId("stub-side-panel")).not.toBeNull();
    expect(screen.getByTestId("stub-code-editor")).not.toBeNull();
  });

  it("B3-U4: renders the R1 empty state (no floating-panel wording) when the tree is null, with no panel stubs mounted", () => {
    useDockStore.setState({ tree: null });
    render(<DockLayout />);

    const empty = screen.getByTestId("dock-empty");
    expect(empty).not.toBeNull();
    // Exact R1 copy — v1.3's "drop a floating panel here" was superseded by
    // v1.4 R1 (floating removed entirely); a mismatch here is a regression
    // to the stale copy, not just a wording nit.
    expect(
      screen.getByText("No panels docked — add one with ＋ Panel"),
    ).not.toBeNull();

    expect(screen.queryByTestId("stub-node-editor")).toBeNull();
    expect(screen.queryByTestId("stub-viewport")).toBeNull();
    expect(screen.queryByTestId("stub-side-panel")).toBeNull();
    expect(screen.queryByTestId("stub-code-editor")).toBeNull();
  });

  it("B3-U4: closing every panel via the real closePanel path (root-first, repeated) reaches the empty state, and addPanel leaves it again", () => {
    const { rerender } = render(<DockLayout />);

    // Repeatedly close whatever leaf is currently first — this drives the
    // store through the same closePanel calls the dock header ✕ (R6) will
    // issue, rather than just setting tree:null directly, so it exercises
    // removePanel's tree-collapsing logic all the way to null.
    act(() => {
      let path = firstLeafPath(useDockStore.getState().tree);
      while (path !== null) {
        useDockStore.getState().closePanel(path);
        path = firstLeafPath(useDockStore.getState().tree);
      }
    });
    expect(useDockStore.getState().tree).toBeNull();
    rerender(<DockLayout />);
    expect(screen.getByTestId("dock-empty")).not.toBeNull();

    // Existing render path regression guard: bringing a panel back makes the
    // empty state disappear and the leaf render again.
    act(() => {
      useDockStore.getState().addPanel("viewport");
    });
    rerender(<DockLayout />);
    expect(screen.queryByTestId("dock-empty")).toBeNull();
    expect(screen.getByTestId("stub-viewport")).not.toBeNull();
  });
});

// B4-U3: drag engine (pending → ghost transition, ghost tracking, drop
// preview, release). The stub `<button data-testid="stub-drag-tab">` inside
// the mocked NodeEditor calls `startTabDrag("nodeEditor", e)` on
// pointerdown — every scenario below drives a real pointerdown on that
// button, then dispatches pointermove/pointerup on `window` the same way
// `DockLayout`'s own listeners are attached (dc `onMove`/`onUp` parity).
describe("DockLayout drag engine (B4-U3)", () => {
  const RECT: DOMRect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1440,
    bottom: 826,
    width: 1440,
    height: 826,
    toJSON() {
      return this;
    },
  };

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      RECT,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Each step gets its own `act()` (rather than batching a whole scenario
  // into one) so React commits + flushes effects between steps — the
  // pointerdown's `setArmed(true)` has to actually run its effect (which
  // attaches the window pointermove/pointerup listeners) *before* the next
  // synthetic `pointermove` is dispatched, or that listener won't exist yet
  // and the move would silently be a no-op.
  // jsdom has no native `PointerEvent` constructor, so
  // `fireEvent.pointerDown(el, {clientX, clientY})` falls back to a plain
  // `Event` that silently drops clientX/clientY (they aren't part of the
  // base `EventInit` dict) — the handler would then read `undefined` and
  // `Math.hypot(NaN, NaN) < 4` is `false`, tripping the ghost transition on
  // *any* move regardless of distance. Dispatch a real `MouseEvent` instead
  // (same trick the spec calls for on pointermove) so clientX/clientY
  // actually land on the event React reads via its "pointerdown" listener.
  function down(clientX: number, clientY: number) {
    act(() => {
      fireEvent(
        screen.getByTestId("stub-drag-tab"),
        new MouseEvent("pointerdown", {
          clientX,
          clientY,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  }

  function move(clientX: number, clientY: number) {
    act(() => {
      fireEvent(window, new MouseEvent("pointermove", { clientX, clientY }));
    });
  }

  function up() {
    act(() => {
      fireEvent(window, new MouseEvent("pointerup", {}));
    });
  }

  it("1. a 3px move stays below the 4px threshold — no ghost, store untouched", () => {
    render(<DockLayout />);
    const before = useDockStore.getState().tree;

    down(100, 100);
    move(103, 100); // hypot(3,0) = 3 < 4

    expect(screen.queryByTestId("dock-drag-ghost")).toBeNull();
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("2. exceeding the 4px threshold detaches the tab and shows the ghost + dock-root--dragging", () => {
    const { container } = render(<DockLayout />);

    down(100, 100);
    move(103, 100); // still < 4, no-op
    move(105, 100); // hypot(5,0) = 5 >= 4 — crosses the threshold

    expect(screen.getByTestId("dock-drag-ghost")).not.toBeNull();
    // nodeEditor is no longer hosted by any leaf — it now lives only in the
    // transient ghost, not the tree (R1: floating is never a resting state,
    // but *while dragging* it is legitimately detached from the tree).
    expect(findTabLeafPath(useDockStore.getState().tree, "nodeEditor")).toBe(
      null,
    );
    expect(
      container.getElementsByClassName("dock-root--dragging"),
    ).toHaveLength(1);
  });

  it('3. moving into the left outer band (x=10) previews "Dock left"', () => {
    render(<DockLayout />);

    down(100, 100);
    move(105, 100); // cross the threshold, ghost appears
    move(10, 400); // x=10 < OUTER_DROP_BAND_PX(42) — left band

    expect(screen.getByText("Dock left")).not.toBeNull();
  });

  it("4. releasing over the left band docks outward-left (row split, ratio 0.28) and clears the ghost", () => {
    render(<DockLayout />);

    down(100, 100);
    move(105, 100);
    move(10, 400);
    up();

    const root = useDockStore.getState().tree;
    expect(root).toMatchObject({ type: "split", dir: "row", ratio: 0.28 });
    expect(screen.queryByTestId("dock-drag-ghost")).toBeNull();
    expect(screen.queryByText("Dock left")).toBeNull();
  });

  it("5. releasing in a gap outside every region/band still docks (R1) via fallbackDropTarget — no floating ghost survives", () => {
    render(<DockLayout />);

    // Release in the 324↔330 divider gap between the viewport and
    // inspector/assets regions — inside neither region's bounds and outside
    // every 42px outer band, so computeDropTarget returns null and onUp must
    // fall back to the first region instead of leaving the ghost resting.
    down(200, 100);
    move(206, 100); // cross the threshold
    move(700, 327); // gap: not in any region, not in any outer band
    up();

    expect(screen.queryByTestId("dock-drag-ghost")).toBeNull();
    const tree = useDockStore.getState().tree;
    const nodeEditorPath = findTabLeafPath(tree, "nodeEditor");
    const viewportPath = findTabLeafPath(tree, "viewport");
    expect(nodeEditorPath).not.toBeNull();
    expect(nodeEditorPath).toEqual(viewportPath);
  });
});
