import { describe, expect, it } from "vitest";
import type { ParamGraphNode } from "../../../core/graph/types";
import { colorSwatchHex, formatParamValue } from "./paramNodeViewHelpers";

describe("formatParamValue", () => {
  it("formats scalar float with 3-decimal precision", () => {
    const node: ParamGraphNode = {
      id: "p",
      kind: "param",
      paramKind: "float",
      value: 0.42,
    };
    expect(formatParamValue(node, 0)).toBe("0.420");
  });

  it("formats vec arrays joined with comma and 2-decimal precision", () => {
    const node: ParamGraphNode = {
      id: "p",
      kind: "param",
      paramKind: "vec3",
      value: [0.1, 0.25, 0.999],
    };
    expect(formatParamValue(node, 0)).toBe("0.10, 0.25, 1.00");
  });

  it("applies time scale + offset (array value)", () => {
    const node: ParamGraphNode = {
      id: "p",
      kind: "param",
      paramKind: "time",
      value: [3, 1],
    };
    // 2 * 3 + 1 = 7
    expect(formatParamValue(node, 2)).toBe("7.00 (×3+1)");
  });

  it("applies time scale = 1, offset = 0 when value is a bare number", () => {
    const node: ParamGraphNode = {
      id: "p",
      kind: "param",
      paramKind: "time",
      value: 5 as unknown as number,
    };
    // [scale=5, offset=0] from non-array fallback: scale = value, offset = 0
    expect(formatParamValue(node, 2)).toBe("10.00 (×5+0)");
  });

  it("defaults scale=1 / offset=0 when the time array is empty", () => {
    const node: ParamGraphNode = {
      id: "p",
      kind: "param",
      paramKind: "time",
      value: [],
    };
    expect(formatParamValue(node, 3)).toBe("3.00 (×1+0)");
  });
});

describe("colorSwatchHex", () => {
  it("converts pure red", () => {
    expect(colorSwatchHex([1, 0, 0])).toBe("#ff0000");
  });

  it("converts pure green / pure blue", () => {
    expect(colorSwatchHex([0, 1, 0])).toBe("#00ff00");
    expect(colorSwatchHex([0, 0, 1])).toBe("#0000ff");
  });

  it("clamps values above 1 and below 0", () => {
    expect(colorSwatchHex([2, -0.5, 0.5])).toBe("#ff0080");
  });

  it("treats missing channels as 0", () => {
    expect(colorSwatchHex([])).toBe("#000000");
    expect(colorSwatchHex([1])).toBe("#ff0000");
  });

  it("zero-pads single hex digits", () => {
    // 0.01 * 255 ≈ 2.55 → 3 → "03"
    expect(colorSwatchHex([0.01, 0.01, 0.01])).toBe("#030303");
  });
});
