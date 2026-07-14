import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRendererStore } from "../state/rendererStore";
import { GpuBlockScreen } from "./GpuBlockScreen";

beforeEach(() => {
  useRendererStore.setState({
    contextUnavailable: false,
    glRetryTick: 0,
    glInfo: null,
  });
});

afterEach(() => {
  cleanup();
});

describe("GpuBlockScreen", () => {
  it("renders nothing while a GL context is available", () => {
    render(<GpuBlockScreen />);
    expect(screen.queryByTestId("gpu-block-screen")).toBeNull();
  });

  it("renders the title, diagnostics and all 3 tips once contextUnavailable is true", () => {
    useRendererStore.getState().setContextUnavailable(true);
    render(<GpuBlockScreen />);

    const screenEl = screen.getByTestId("gpu-block-screen");
    expect(screenEl).not.toBeNull();
    expect(screen.getByText("WebGL2 is not available")).not.toBeNull();
    expect(screen.getByText("null")).not.toBeNull();
    expect(screen.getByText("unavailable")).not.toBeNull();
    expect(screen.getAllByText("unsupported")).toHaveLength(1);
    expect(screen.getByText(/Enable hardware acceleration/)).not.toBeNull();
    expect(screen.getByText(/Update your graphics drivers/)).not.toBeNull();
    expect(screen.getByText(/current Chrome, Edge or Firefox/)).not.toBeNull();
  });

  it("reflects glInfo.renderer in the diagnostics box when set", () => {
    useRendererStore.setState({
      contextUnavailable: true,
      glInfo: { renderer: "SwiftShader", version: "WebGL 2.0" },
    });
    render(<GpuBlockScreen />);
    expect(screen.getByText("SwiftShader")).not.toBeNull();
  });

  it("clicking Retry bumps glRetryTick and hides the screen", () => {
    useRendererStore.getState().setContextUnavailable(true);
    render(<GpuBlockScreen />);

    const before = useRendererStore.getState().glRetryTick;
    fireEvent.click(screen.getByTestId("gpu-block-retry"));

    expect(useRendererStore.getState().glRetryTick).toBe(before + 1);
    expect(useRendererStore.getState().contextUnavailable).toBe(false);
    expect(screen.queryByTestId("gpu-block-screen")).toBeNull();
  });
});
