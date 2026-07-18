import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDebugUiStore } from "../../state/debugUiStore";
import {
  emptyDiagnostics,
  useDiagnosticsStore,
} from "../../state/diagnosticsStore";
import { useDockStore } from "../../state/dockStore";
import { createDefaultDockTree, getNodeAt } from "../../state/dockTree";
import { useRendererStore } from "../../state/rendererStore";
import { StatusBar } from "./StatusBar";

// NOTE: zustand v5 + useSyncExternalStore returns the *initial* store snapshot
// during renderToStaticMarkup, so these tests assert what the bar shows when
// the renderer hasn't reported stats yet (the cold-start state a user sees
// before GL init completes).

describe("StatusBar", () => {
  it("renders the GL init state when the renderer isn't ready", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain("GL init");
  });

  it("shows FPS / draws / N·E counters in their static formats", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toMatch(/\d+ FPS/);
    expect(html).toMatch(/\d+ draws/);
    expect(html).toMatch(/\d+N · \d+E/);
  });

  it("shows the 'no problems' label when there are no diagnostics or runtime errors", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain("no problems");
  });

  it("annotates the FPS / draws / counters with title tooltips", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain('title="Frames per second"');
    expect(html).toContain('title="Draw calls per frame"');
    expect(html).toContain('title="Total nodes / edges in the graph"');
  });

  it("shows the u_time reading in its static 't 0.00s' cold-start format", () => {
    // u_time is sampled on an interval (not subscribed), so a render before
    // the first interval tick shows the store's initial simTime (0).
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toMatch(/t \d+\.\d{2}s/);
    expect(html).toContain("t 0.00s");
  });

  it("renders the ◨ Diagnostics toggle button", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain('data-testid="open-diagnostics"');
    expect(html).toContain("◨ Diagnostics");
  });

  it("renders the left status pill with a stable testid", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain('data-testid="status-pill"');
  });
});

// B5-U3 (R5): diagnostics/problems are no longer Side Panel tabs — they're
// bottom transient overlays toggled purely by debugUiStore. These tests need
// a live DOM (fireEvent) rather than the static-markup snapshots above, so
// they get their own describe/afterEach pair (initial-snapshot reset pattern
// from SidePanel.test.tsx).
describe("StatusBar — problems count and diagnostics toggle (R5)", () => {
  const initialDock = useDockStore.getState();
  const initialDebugUi = useDebugUiStore.getState();
  const initialDiagnostics = useDiagnosticsStore.getState();
  const initialRenderer = useRendererStore.getState();

  beforeEach(() => {
    useDockStore.setState(
      { ...initialDock, tree: createDefaultDockTree() },
      true,
    );
  });

  afterEach(() => {
    cleanup();
    useDockStore.setState(initialDock, true);
    useDebugUiStore.setState(initialDebugUi, true);
    useDiagnosticsStore.setState(initialDiagnostics, true);
    useRendererStore.setState(initialRenderer, true);
  });

  it("sums shader diagnostics (all severities) + runtime errors into the status-problems count", () => {
    useDiagnosticsStore.getState().set("s1", {
      ...emptyDiagnostics(),
      vertex: [{ line: 1, severity: "error", message: "a" }],
      fragment: [{ line: 2, severity: "warning", message: "b" }],
    });
    useRendererStore.setState((s) => ({
      stats: { ...s.stats, errors: ["boom"] },
    }));

    render(<StatusBar />);

    const problems = screen.getByTestId("status-problems");
    expect(problems.textContent).toBe("⚠ 3 problems");
  });

  it("clicking status-problems opens the problems overlay without opening diagnostics", () => {
    render(<StatusBar />);

    fireEvent.click(screen.getByTestId("status-problems"));

    expect(useDebugUiStore.getState().problemsOpen).toBe(true);
    expect(useDebugUiStore.getState().open).toBe(false);
  });

  it("clicking open-diagnostics opens diagnostics without touching the dock tree", () => {
    useDockStore.getState().toggleCollapsed(["a", "b", "b"]);
    const treeBefore = useDockStore.getState().tree;
    const leafBefore =
      treeBefore === null ? null : getNodeAt(treeBefore, ["a", "b", "b"]);
    expect(leafBefore !== null && leafBefore.type === "leaf").toBe(true);
    expect(
      leafBefore !== null && leafBefore.type === "leaf"
        ? leafBefore.collapsed
        : undefined,
    ).toBe(true);

    render(<StatusBar />);
    fireEvent.click(screen.getByTestId("open-diagnostics"));

    expect(useDebugUiStore.getState().open).toBe(true);
    // Regression guard for the un-collapse removal (R5): the leaf stays
    // collapsed — StatusBar no longer touches dockStore at all.
    const treeAfter = useDockStore.getState().tree;
    const leafAfter =
      treeAfter === null ? null : getNodeAt(treeAfter, ["a", "b", "b"]);
    expect(
      leafAfter !== null && leafAfter.type === "leaf"
        ? leafAfter.collapsed
        : undefined,
    ).toBe(true);
  });
});

// B6-U2 (R9): 'N panels docked' — GL status pill's neighbor in the status
// bar, tracking `collectPanelIds(dockStore.tree).length` in real time.
describe("StatusBar — 'N panels docked' (B6-U2)", () => {
  const initialDock = useDockStore.getState();

  beforeEach(() => {
    useDockStore.setState(
      { ...initialDock, tree: createDefaultDockTree() },
      true,
    );
  });

  afterEach(() => {
    cleanup();
    useDockStore.setState(initialDock, true);
  });

  it("renders '5 panels docked' for the default tree", () => {
    render(<StatusBar />);
    expect(screen.getByTestId("status-docked").textContent).toBe(
      "5 panels docked",
    );
  });

  it("tracks closeTab in real time — '3 panels docked' after two closes", () => {
    render(<StatusBar />);
    act(() => {
      useDockStore.getState().closeTab("assets");
      useDockStore.getState().closeTab("code");
    });
    expect(screen.getByTestId("status-docked").textContent).toBe(
      "3 panels docked",
    );
  });

  it("shows '0 panels docked' for an empty (all panels closed) tree", () => {
    useDockStore.setState({ tree: null });
    render(<StatusBar />);
    expect(screen.getByTestId("status-docked").textContent).toBe(
      "0 panels docked",
    );
  });
});
