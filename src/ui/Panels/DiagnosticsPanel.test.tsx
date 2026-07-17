import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { clearLogBuffer, log } from "../../utils/log";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

const initialRenderer = useRendererStore.getState();
const initialGraph = useGraphStore.getState();
const initialDiagnostics = useDiagnosticsStore.getState();

function resetStores() {
  useRendererStore.setState(initialRenderer, true);
  useGraphStore.setState(initialGraph, true);
  useDiagnosticsStore.setState(initialDiagnostics, true);
  clearLogBuffer();
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

describe("DiagnosticsPanel", () => {
  it("renders the panel chrome (filters + copy/clear/close)", () => {
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain('data-testid="diagnostics-panel"');
    expect(html).toContain('data-testid="diagnostics-level-filter"');
    expect(html).toContain('data-testid="diagnostics-category-filter"');
    expect(html).toContain('data-testid="diagnostics-copy"');
    expect(html).toContain('data-testid="diagnostics-clear"');
    expect(html).toContain('data-testid="diagnostics-close"');
  });

  it("shows the empty-state message when the buffer is empty", () => {
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain("표시할 로그가 없습니다");
  });

  it("seeds the list from the log buffer at render time", () => {
    // warn stays below the test-setup minLevel so it doesn't mirror to console,
    // but the buffer records it regardless — which is what the panel reads.
    log.warn("gl", "seed-marker");
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain("seed-marker");
    expect(html).toContain("WARN");
    expect(html).toContain("gl");
  });

  // NOTE: uses client render()/screen (not renderToStaticMarkup) — zustand
  // v5's useSyncExternalStore returns the *initial* snapshot under SSR (see
  // StatusBar.test.tsx's note), so a post-mount store mutation only shows up
  // through an actual client render.
  it("renders the GPU/Frame/Draw calls/Shaders metric cards from rendererStore + graphStore/diagnosticsStore", () => {
    useRendererStore.setState({
      glInfo: { renderer: "ANGLE Metal", version: "WebGL 2.0" },
      stats: {
        ...useRendererStore.getState().stats,
        fps: 60,
        drawCalls: 42,
      },
    });
    useGraphStore.getState().addNode({
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {},
    });

    render(<DiagnosticsPanel />);
    const panel = screen.getByTestId("diagnostics-panel");
    expect(panel.textContent).toContain("ANGLE Metal");
    expect(panel.textContent).toContain("16.7 ms · 60 fps");
    expect(panel.textContent).toContain("42");
    // [A-6] label + proxy value: the one shader node added above has no error
    // diagnostic, so it counts as compiled.
    expect(panel.textContent).toContain("Shaders");
    expect(panel.textContent).toContain("1 compiled");
  });

  // Uses client render()/screen, not renderToStaticMarkup, for the same
  // reason as the metric-cards test above: a post-mount store mutation only
  // shows up through an actual client render under zustand v5's SSR snapshot
  // behavior.
  it("keeps the metric grid item shrinkable so a long GPU renderer string doesn't collapse the 2x2 layout", () => {
    // Real ANGLE/SwiftShader renderer strings run ~90 chars — long enough
    // that, without minWidth:0 on the grid item, the browser's implicit
    // min-width:auto forces this track (and the whole grid) to the
    // string's intrinsic width, pushing the other metric cards off-panel.
    const longRenderer =
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";
    useRendererStore.setState({
      glInfo: { renderer: longRenderer, version: "WebGL 2.0" },
    });

    render(<DiagnosticsPanel />);
    const panel = screen.getByTestId("diagnostics-panel");
    expect(panel.textContent).toContain(longRenderer);
    // All 4 metric cards must still render (nothing pushed out of view).
    expect(panel.textContent).toContain("Frame");
    expect(panel.textContent).toContain("Draw calls");
    expect(panel.textContent).toContain("Shaders");
    // The grid item itself must be allowed to shrink below its content's
    // intrinsic width — this is what keeps the 2x2 grid from collapsing.
    expect(panel.innerHTML).toContain("min-width: 0;");
  });

  it("uses semantic/text.muted level colors, not the retired palette", () => {
    log.error("gl", "boom");
    log.debug("app", "quiet");
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain("var(--error)");
    expect(html).toContain("var(--text-muted)");
    for (const retired of ["#7a7a7a", "#7aa2f7", "#e0af68", "#ff6b6b"]) {
      expect(html).not.toContain(retired);
    }
  });
});
