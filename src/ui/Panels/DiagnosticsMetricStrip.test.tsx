import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { DiagnosticsMetricStrip } from "./DiagnosticsMetricStrip";

const initialRenderer = useRendererStore.getState();
const initialGraph = useGraphStore.getState();
const initialDiagnostics = useDiagnosticsStore.getState();

function resetStores() {
  useRendererStore.setState(initialRenderer, true);
  useGraphStore.setState(initialGraph, true);
  useDiagnosticsStore.setState(initialDiagnostics, true);
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

describe("DiagnosticsMetricStrip", () => {
  it("renders the container testid and all 4 labels with idle values", () => {
    render(<DiagnosticsMetricStrip />);

    const strip = screen.getByTestId("diagnostics-metric-strip");
    expect(strip).not.toBeNull();
    expect(strip.textContent).toContain("GPU");
    expect(strip.textContent).toContain("Frame");
    expect(strip.textContent).toContain("Draws");
    expect(strip.textContent).toContain("Shaders");
    expect(strip.textContent).toContain("—");
  });

  it("reflects rendererStore/graphStore/diagnosticsStore values (same source as the 2x2 cards)", () => {
    useRendererStore.getState().setGlInfo({
      renderer: "Apple M1",
      version: "WebGL 2.0",
    });
    useRendererStore.setState({
      stats: { ...useRendererStore.getState().stats, fps: 60, drawCalls: 142 },
    });
    useGraphStore.getState().addNode({
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {},
    });

    render(<DiagnosticsMetricStrip />);
    const strip = screen.getByTestId("diagnostics-metric-strip");
    expect(strip.textContent).toContain("Apple M1");
    expect(strip.textContent).toContain("16.7 ms · 60 fps");
    expect(strip.textContent).toContain("142");
    expect(strip.textContent).toContain("1 compiled");
  });
});
