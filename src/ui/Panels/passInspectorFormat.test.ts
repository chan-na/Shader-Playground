import { describe, expect, it } from "vitest";
import {
  computeMeshLabel,
  formatFbo,
  formatGpuMs,
  formatSampler,
} from "./passInspectorFormat";

describe("formatFbo", () => {
  it("formats a full-resolution (1×) pass", () => {
    expect(formatFbo(1920, 1080, 1)).toBe("1920×1080 (1×)");
  });

  it("formats a half-resolution (0.5×) pass", () => {
    expect(formatFbo(960, 540, 0.5)).toBe("960×540 (0.5×)");
  });

  it("formats a quarter-resolution (0.25×) pass", () => {
    expect(formatFbo(480, 270, 0.25)).toBe("480×270 (0.25×)");
  });
});

describe("formatSampler", () => {
  it("formats a bound sampler with its source node and texture unit", () => {
    expect(formatSampler("u_tex", "noise1", 0)).toBe("u_tex ← noise1 (unit 0)");
  });

  it("formats a higher texture unit index", () => {
    expect(formatSampler("u_prev", "blur1", 3)).toBe("u_prev ← blur1 (unit 3)");
  });
});

describe("formatGpuMs", () => {
  it("renders an em dash when no sample exists yet", () => {
    expect(formatGpuMs(undefined)).toBe("—");
  });

  it("formats a sample to 2 decimal places", () => {
    expect(formatGpuMs(0.3)).toBe("0.30");
  });

  it("renders a measured zero distinctly from 'no sample'", () => {
    expect(formatGpuMs(0)).toBe("0.00");
  });
});

describe("computeMeshLabel", () => {
  it("formats primitive, count, and the A read side", () => {
    expect(computeMeshLabel("POINTS", 1024, "A")).toBe("POINTS ×1024, read=A");
  });

  it("formats the B read side", () => {
    expect(computeMeshLabel("TRIANGLES", 512, "B")).toBe(
      "TRIANGLES ×512, read=B",
    );
  });
});
