import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useGpuTimerStore } from "../../../state/gpuTimerStore";
import { GpuTimerChip } from "./GpuTimerChip";

const initialGpuTimer = useGpuTimerStore.getState();

afterEach(() => {
  useGpuTimerStore.setState(initialGpuTimer, true);
  cleanup();
});

function setGpuTimerState(state: {
  supported: boolean;
  enabled: boolean;
  byNode: Record<string, number>;
}) {
  useGpuTimerStore.setState(state);
}

describe("GpuTimerChip", () => {
  it("renders the smoothed ms value with the overlay.scrim background", () => {
    setGpuTimerState({ supported: true, enabled: true, byNode: { n1: 0.42 } });
    render(<GpuTimerChip nodeId="n1" />);
    const chip = screen.getByTestId("gpu-ms-n1");
    // jsdom's CSSOM re-serializes the inline style and re-inserts the
    // spaces tokens.overlay.scrim omits ("rgba(0,0,0,0.5)" →
    // "rgba(0, 0, 0, 0.5)"), so we match on channel/alpha values rather
    // than a literal string identity with the token.
    expect(chip.style.background).toMatch(/^rgba\(0,\s*0,\s*0,\s*0?\.5\)$/);
    expect(chip.textContent).toBe("0.42ms");
  });

  it("renders nothing when the timer extension is unsupported", () => {
    setGpuTimerState({ supported: false, enabled: true, byNode: { n1: 0.42 } });
    const { container } = render(<GpuTimerChip nodeId="n1" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows <0.01ms for sub-hundredth samples", () => {
    setGpuTimerState({ supported: true, enabled: true, byNode: { n1: 0.005 } });
    render(<GpuTimerChip nodeId="n1" />);
    expect(screen.getByTestId("gpu-ms-n1").textContent).toBe("<0.01ms");
  });
});
