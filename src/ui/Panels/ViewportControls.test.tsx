import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { ViewportControls } from "./ViewportControls";

// Time/Camera controls moved to TransportBar (M3-U3) — see
// src/ui/Viewport/TransportBar.test.tsx. This suite only covers what's left:
// the Viewport section (background swatch + GPU timer toggle).

const initialGpuTimer = useGpuTimerStore.getState();

afterEach(() => {
  useGpuTimerStore.setState(initialGpuTimer, true);
  cleanup();
});

describe("ViewportControls", () => {
  it("renders only the Viewport section (no Time/Camera headings)", () => {
    render(<ViewportControls />);
    expect(screen.getByText("Viewport")).not.toBeNull();
    expect(screen.queryByText("Time")).toBeNull();
    expect(screen.queryByText("Camera")).toBeNull();
  });

  it("does not expose the time/camera transport testids (moved to TransportBar)", () => {
    render(<ViewportControls />);
    expect(screen.queryByTestId("time-playpause")).toBeNull();
    expect(screen.queryByTestId("time-scrub")).toBeNull();
    expect(screen.queryByTestId("time-speed")).toBeNull();
    expect(screen.queryByTestId("camera-fov")).toBeNull();
  });

  it("exposes the background color swatch", () => {
    render(<ViewportControls />);
    const swatch = screen.getByTestId("bg-color");
    expect(swatch).not.toBeNull();
    // useViewportStore's default background [0.07, 0.07, 0.09] (viewportStore.ts).
    expect(swatch.getAttribute("value")).toBe("#121217");
  });

  it("shows the GPU timer toggle when supported, unavailable otherwise", () => {
    useGpuTimerStore.setState({ supported: false });
    const { unmount } = render(<ViewportControls />);
    expect(screen.getByTestId("gpu-timer-unsupported")).not.toBeNull();
    expect(screen.queryByTestId("gpu-timer-toggle")).toBeNull();
    unmount();

    useGpuTimerStore.setState({ supported: true, enabled: true });
    render(<ViewportControls />);
    const toggle = screen.getByTestId("gpu-timer-toggle");
    expect(toggle).not.toBeNull();
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });
});
