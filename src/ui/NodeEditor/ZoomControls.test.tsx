import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatZoom, ZoomControls } from "./ZoomControls";

describe("formatZoom", () => {
  it("rounds a React Flow zoom factor to a whole percent", () => {
    expect(formatZoom(0.82)).toBe("82%");
    expect(formatZoom(1)).toBe("100%");
  });

  it("rounds .5-and-up up, not just truncates", () => {
    expect(formatZoom(0.825)).toBe("83%");
    expect(formatZoom(0.824)).toBe("82%");
  });
});

describe("ZoomControls", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders zoom out / zoom in / fit view buttons plus the current zoom label", () => {
    render(
      <ReactFlowProvider>
        <ZoomControls />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole("button", { name: "Zoom out" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Zoom in" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Fit view" })).not.toBeNull();
    // ReactFlowProvider's default viewport is zoom: 1 (no <ReactFlow> mounted
    // to change it), so the label starts at "100%".
    expect(screen.getByText("100%")).not.toBeNull();
  });

  it("exposes a data-testid on the control cluster for e2e targeting", () => {
    render(
      <ReactFlowProvider>
        <ZoomControls />
      </ReactFlowProvider>,
    );
    expect(screen.getByTestId("zoom-controls")).not.toBeNull();
  });

  // Outside a mounted <ReactFlow> there's no d3-zoom `panZoom` instance in the
  // store, so zoomIn/zoomOut/fitView all resolve to a no-op `false` — this
  // only guards that the click handlers don't throw when wired up; the
  // actual zoom-changes-the-label behavior is exercised by the Phase E2E
  // spec against a real mounted flow.
  it("zoom out / zoom in / fit clicks do not throw with no panZoom instance mounted", () => {
    render(
      <ReactFlowProvider>
        <ZoomControls />
      </ReactFlowProvider>,
    );
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      fireEvent.click(screen.getByRole("button", { name: "Fit view" }));
    }).not.toThrow();
  });
});
