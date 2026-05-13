import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ViewportControls } from "./ViewportControls";

// NOTE: zustand v5 + useSyncExternalStore returns the *initial* store snapshot
// during renderToStaticMarkup, so we exercise the cold-start layout (time = 0,
// paused, default camera/background). Interactive store mutations are covered
// by their store-level unit tests.

describe("ViewportControls", () => {
  it("renders Time / Camera / Viewport sections", () => {
    const html = renderToStaticMarkup(<ViewportControls />);
    expect(html).toContain(">Time<");
    expect(html).toContain(">Camera<");
    expect(html).toContain(">Viewport<");
  });

  it("starts playing (⏸ Pause visible at initial state)", () => {
    // timeStore initial playing = true → button shows ⏸ Pause
    const html = renderToStaticMarkup(<ViewportControls />);
    expect(html).toContain("⏸ Pause");
    expect(html).not.toContain("▶ Play");
  });

  it("exposes test-id hooks for time / speed / fov / background", () => {
    const html = renderToStaticMarkup(<ViewportControls />);
    expect(html).toContain('data-testid="time-playpause"');
    expect(html).toContain('data-testid="time-scrub"');
    expect(html).toContain('data-testid="time-speed"');
    expect(html).toContain('data-testid="camera-fov"');
    expect(html).toContain('data-testid="bg-color"');
  });

  it("labels the reset buttons with their tooltips (titles)", () => {
    const html = renderToStaticMarkup(<ViewportControls />);
    expect(html).toContain('title="Reset time"');
    expect(html).toContain('title="Reset camera"');
  });

  it("formats time as 0.00s by default and FOV in degrees", () => {
    const html = renderToStaticMarkup(<ViewportControls />);
    expect(html).toContain("0.00s");
    // FOV label: e.g. "60°" / "45°" depending on default camera fov
    expect(html).toMatch(/\d+°/);
  });
});
