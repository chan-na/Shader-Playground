import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToHex } from "./colorConvert";

describe("rgbToHex / hexToRgb", () => {
  it("round-trips pure-channel colors", () => {
    expect(rgbToHex([1, 0, 0])).toBe("#ff0000");
    expect(rgbToHex([0, 1, 0])).toBe("#00ff00");
    expect(rgbToHex([0, 0, 1])).toBe("#0000ff");
    const [r, g, b] = hexToRgb("#ff8000");
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(0.5, 1);
    expect(b).toBeCloseTo(0, 2);
  });

  it("clamps channels above 1", () => {
    expect(rgbToHex([2, 1, 1])).toBe("#ffffff");
  });

  it("clamps negative channels to 0", () => {
    expect(rgbToHex([-1, 0.5, 0])).toBe("#008000");
  });

  it("treats missing channels as 0", () => {
    expect(rgbToHex([])).toBe("#000000");
  });

  it("accepts a readonly array", () => {
    const rgb: readonly number[] = [0.5, 0.5, 0.5];
    expect(rgbToHex(rgb)).toBe("#808080");
  });
});
