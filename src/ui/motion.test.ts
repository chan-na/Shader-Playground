import { describe, expect, it } from "vitest";
import { tokens } from "../theme";
import { MOTION_MAX_MS, MOTION_MID_MS, STATUS_PULSE_ANIMATION } from "./motion";

describe("motion constants", () => {
  it("derives MOTION_MAX_MS from tokens.motion.durationMs.max", () => {
    expect(MOTION_MAX_MS).toBe(tokens.motion.durationMs.max);
  });

  it("derives MOTION_MID_MS as the rounded min/max average, within band", () => {
    const { min, max } = tokens.motion.durationMs;
    expect(MOTION_MID_MS).toBe(Math.round((min + max) / 2));
    expect(MOTION_MID_MS).toBe(120);
    expect(MOTION_MID_MS).toBeGreaterThanOrEqual(min);
    expect(MOTION_MID_MS).toBeLessThanOrEqual(max);
  });

  it("STATUS_PULSE_ANIMATION is an sp-pulse infinite loop shorthand", () => {
    expect(STATUS_PULSE_ANIMATION.startsWith("sp-pulse")).toBe(true);
    expect(STATUS_PULSE_ANIMATION).toContain("infinite");
  });
});
