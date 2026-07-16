import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useLayoutStore } from "../../state/layoutStore";
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

  it("shows the 'no errors' label when the error list is empty", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain("no errors");
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

  it("renders the Diagnostics toggle button", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain('data-testid="open-diagnostics"');
  });

  it("renders the left status pill with a stable testid", () => {
    const html = renderToStaticMarkup(<StatusBar />);
    expect(html).toContain('data-testid="status-pill"');
  });
});

// D1: Diagnostics moved into the Side Panel as its 4th tab, so opening it
// from StatusBar must also un-collapse a collapsed side panel — otherwise
// the toggle flips debugUiStore.open with no visible effect. This needs a
// live DOM (fireEvent) rather than the static-markup snapshots above, so it
// gets its own describe/afterEach pair.
describe("StatusBar — Diagnostics entry point un-collapses the side panel (D1)", () => {
  const initialLayout = useLayoutStore.getState();
  const initialDebugUi = useDebugUiStore.getState();

  afterEach(() => {
    cleanup();
    useLayoutStore.setState(initialLayout, true);
    useDebugUiStore.setState(initialDebugUi, true);
  });

  it("expands a collapsed side panel and opens diagnostics on click", () => {
    useLayoutStore.setState((s) => ({
      collapsed: { ...s.collapsed, sidePanel: true },
    }));

    render(<StatusBar />);
    fireEvent.click(screen.getByTestId("open-diagnostics"));

    expect(useDebugUiStore.getState().open).toBe(true);
    expect(useLayoutStore.getState().collapsed.sidePanel).toBe(false);
  });
});
