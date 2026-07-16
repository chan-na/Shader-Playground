import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { PaneOverlay } from "./PaneOverlay";

const initialRenderer = useRendererStore.getState();
const initialGpuTimer = useGpuTimerStore.getState();

const TWO_PANES = [
  { outputNodeId: "o1", sourceNodeId: "s1" },
  { outputNodeId: "o2", sourceNodeId: "s2" },
];

beforeEach(() => {
  useRendererStore.setState({
    panes: TWO_PANES,
    canvasSize: { width: 800, height: 600 },
  });
  useGpuTimerStore.setState({
    byNode: { s1: 0.42, s2: 1.234 },
    enabled: true,
    supported: true,
  });
  useGraphStore.setState({
    nodes: [
      { id: "o1", kind: "output", name: "main" },
      { id: "o2", kind: "output" },
    ],
  });
});

afterEach(() => {
  useRendererStore.setState(initialRenderer, true);
  useGpuTimerStore.setState(initialGpuTimer, true);
  useGraphStore.getState().reset();
  cleanup();
});

describe("PaneOverlay", () => {
  it("renders pane letters A/B and each pane's output label (named node suffixed, unnamed node bare)", () => {
    render(<PaneOverlay />);
    const label0 = screen.getByTestId("vp-pane-label-0");
    const label1 = screen.getByTestId("vp-pane-label-1");
    expect(label0.querySelector(".vp-pane-chip")?.textContent).toBe("A");
    expect(label0.querySelector(".vp-pane-name")?.textContent).toBe(
      "Output · main",
    );
    expect(label1.querySelector(".vp-pane-chip")?.textContent).toBe("B");
    expect(label1.querySelector(".vp-pane-name")?.textContent).toBe("Output");
  });

  it("falls back to bare 'Output' when the output node's name is whitespace-only", () => {
    useGraphStore.setState({
      nodes: [{ id: "o1", kind: "output", name: "  " }],
    });
    useRendererStore.setState({
      panes: [{ outputNodeId: "o1", sourceNodeId: "s1" }],
    });
    render(<PaneOverlay />);
    expect(
      screen.getByTestId("vp-pane-label-0").querySelector(".vp-pane-name")
        ?.textContent,
    ).toBe("Output");
  });

  it("falls back to bare 'Output' when the pane's outputNodeId has no matching graph node (stale pane)", () => {
    useGraphStore.setState({ nodes: [] });
    useRendererStore.setState({
      panes: [{ outputNodeId: "gone", sourceNodeId: "s1" }],
    });
    render(<PaneOverlay />);
    expect(
      screen.getByTestId("vp-pane-label-0").querySelector(".vp-pane-name")
        ?.textContent,
    ).toBe("Output");
  });

  it("renders a resolution caption matching the splitLayout cell size", () => {
    render(<PaneOverlay />);
    // 2-way split of an 800x600 canvas: 400x600 each (splitLayout.test.ts).
    expect(screen.getByTestId("vp-pane-res-0").textContent).toBe("400 × 600");
    expect(screen.getByTestId("vp-pane-res-1").textContent).toBe("400 × 600");
  });

  it("marks both panes of a 2-way split as bottom-row (n=2 → [true, true])", () => {
    render(<PaneOverlay />);
    expect(
      screen
        .getByTestId("vp-pane-res-0")
        .closest(".vp-pane")
        ?.classList.contains("vp-pane--bottom"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("vp-pane-res-1")
        .closest(".vp-pane")
        ?.classList.contains("vp-pane--bottom"),
    ).toBe(true);
  });

  it("marks only the bottom row of a 4-way split as bottom-row (n=4 → [false, false, true, true])", () => {
    useRendererStore.setState({
      panes: [
        { outputNodeId: "o1", sourceNodeId: "s1" },
        { outputNodeId: "o2", sourceNodeId: "s2" },
        { outputNodeId: "o3", sourceNodeId: "s3" },
        { outputNodeId: "o4", sourceNodeId: "s4" },
      ],
    });
    render(<PaneOverlay />);
    expect(
      screen
        .getByTestId("vp-pane-res-0")
        .closest(".vp-pane")
        ?.classList.contains("vp-pane--bottom"),
    ).toBe(false);
    expect(
      screen
        .getByTestId("vp-pane-res-1")
        .closest(".vp-pane")
        ?.classList.contains("vp-pane--bottom"),
    ).toBe(false);
    expect(
      screen
        .getByTestId("vp-pane-res-2")
        .closest(".vp-pane")
        ?.classList.contains("vp-pane--bottom"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("vp-pane-res-3")
        .closest(".vp-pane")
        ?.classList.contains("vp-pane--bottom"),
    ).toBe(true);
  });

  it("renders the GPU ms badge for each pane's source node when enabled and supported", () => {
    render(<PaneOverlay />);
    expect(screen.getByTestId("vp-pane-ms-0").textContent).toBe("0.42 ms");
    expect(screen.getByTestId("vp-pane-ms-1").textContent).toBe("1.23 ms");
  });

  it("hides the GPU ms badge when the timer is disabled", () => {
    useGpuTimerStore.setState({ enabled: false });
    render(<PaneOverlay />);
    expect(screen.queryByTestId("vp-pane-ms-0")).toBeNull();
    expect(screen.queryByTestId("vp-pane-ms-1")).toBeNull();
  });

  it("hides the GPU ms badge when the timer is unsupported", () => {
    useGpuTimerStore.setState({ supported: false });
    render(<PaneOverlay />);
    expect(screen.queryByTestId("vp-pane-ms-0")).toBeNull();
  });

  it("renders nothing when there are no panes", () => {
    useRendererStore.setState({ panes: [] });
    const { container } = render(<PaneOverlay />);
    expect(container.firstChild).toBeNull();
  });
});
