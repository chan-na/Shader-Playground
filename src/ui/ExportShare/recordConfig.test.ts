import { describe, expect, it } from "vitest";
import {
  estimateGifSizeMB,
  gifProgressPct,
  webmElapsedLabel,
} from "./recordConfig";

describe("estimateGifSizeMB", () => {
  it("returns the base estimate at the reference fps/longEdge/duration", () => {
    expect(estimateGifSizeMB(12, 480, 4)).toBe("3.4 MB");
  });

  it("scales roughly with the square of the long edge", () => {
    const small = Number.parseFloat(estimateGifSizeMB(12, 240, 4));
    const base = Number.parseFloat(estimateGifSizeMB(12, 480, 4));
    const large = Number.parseFloat(estimateGifSizeMB(12, 960, 4));
    expect(small).toBeLessThan(base);
    expect(base).toBeLessThan(large);
    // 240 -> 480 halves the edge -> quarters the area -> ~0.8 MB (0.85
    // rounded to the formatted string's one decimal place).
    expect(small).toBeCloseTo(0.8, 5);
    // 480 -> 960 doubles the edge -> quadruples the area -> ~13.6 MB.
    expect(large).toBeCloseTo(13.6, 5);
  });

  it("increases monotonically with fps", () => {
    const slow = Number.parseFloat(estimateGifSizeMB(12, 480, 4));
    const fast = Number.parseFloat(estimateGifSizeMB(30, 480, 4));
    expect(fast).toBeGreaterThan(slow);
  });

  it("increases monotonically with duration", () => {
    const short = Number.parseFloat(estimateGifSizeMB(12, 480, 1));
    const long = Number.parseFloat(estimateGifSizeMB(12, 480, 10));
    expect(long).toBeGreaterThan(short);
  });

  it("formats to one decimal place with an ' MB' suffix", () => {
    expect(estimateGifSizeMB(12, 480, 4)).toMatch(/^\d+\.\d MB$/);
  });
});

describe("gifProgressPct", () => {
  it("is 0 at the start of a recording", () => {
    expect(gifProgressPct(0, 4)).toBe(0);
  });

  it("is 50 halfway through the configured duration", () => {
    expect(gifProgressPct(2000, 4)).toBe(50);
  });

  it("clamps to 100 once elapsed overruns the cap", () => {
    expect(gifProgressPct(6000, 4)).toBe(100);
  });

  it("returns 0 for a non-positive duration instead of dividing by zero", () => {
    expect(gifProgressPct(1000, 0)).toBe(0);
  });
});

describe("webmElapsedLabel", () => {
  it("formats the elapsed seconds to one decimal place", () => {
    expect(webmElapsedLabel(1000, 4200)).toBe("3.2s");
  });

  it("never goes negative if now is somehow before startedAt", () => {
    expect(webmElapsedLabel(5000, 4000)).toBe("0.0s");
  });
});
