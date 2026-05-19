import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ColorField,
  clampParse,
  formatNumber,
  hexToRgb,
  NumberField,
  rgbToHex,
} from "./ValueInput";

describe("formatNumber", () => {
  it("zero-pads to the requested precision", () => {
    expect(formatNumber(0.5, 3)).toBe("0.500");
    expect(formatNumber(1, 2)).toBe("1.00");
  });
  it("falls back to '0' for non-finite values", () => {
    expect(formatNumber(Number.NaN, 3)).toBe("0");
    expect(formatNumber(Number.POSITIVE_INFINITY, 3)).toBe("0");
  });
});

describe("clampParse", () => {
  it("returns null for non-numeric input so the commit pipeline can skip it", () => {
    expect(clampParse("", undefined, undefined)).toBeNull();
    expect(clampParse("abc", undefined, undefined)).toBeNull();
    expect(clampParse("-", undefined, undefined)).toBeNull();
  });
  it("parses well-formed numbers", () => {
    expect(clampParse("1.5", undefined, undefined)).toBe(1.5);
    expect(clampParse("-2", undefined, undefined)).toBe(-2);
  });
  it("clamps below min and above max", () => {
    expect(clampParse("-5", 0, 1)).toBe(0);
    expect(clampParse("5", 0, 1)).toBe(1);
    expect(clampParse("0.4", 0, 1)).toBe(0.4);
  });
});

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
  it("clamps out-of-range channels", () => {
    expect(rgbToHex([2, -1, 0.5])).toBe("#ff0080");
  });
  it("treats missing channels as 0", () => {
    expect(rgbToHex([])).toBe("#000000");
  });
});

describe("NumberField (static markup)", () => {
  it("renders the formatted value as the input text", () => {
    const html = renderToStaticMarkup(
      <NumberField value={0.42} onCommit={() => {}} />,
    );
    expect(html).toContain('value="0.420"');
    expect(html).toContain('type="number"');
    expect(html).toContain("nodrag");
  });

  it("honors a custom precision", () => {
    const html = renderToStaticMarkup(
      <NumberField value={1} onCommit={() => {}} precision={2} />,
    );
    expect(html).toContain('value="1.00"');
  });

  it("emits min/max attributes when provided", () => {
    const html = renderToStaticMarkup(
      <NumberField value={0.5} onCommit={() => {}} min={0} max={1} />,
    );
    expect(html).toContain('min="0"');
    expect(html).toContain('max="1"');
  });
});

describe("ColorField (static markup)", () => {
  it("renders a color picker pre-filled with the current value", () => {
    const html = renderToStaticMarkup(
      <ColorField value={[1, 0, 0]} onCommit={() => {}} />,
    );
    expect(html).toContain('type="color"');
    expect(html).toContain('value="#ff0000"');
    expect(html).toContain("nodrag");
  });
});
