import { describe, expect, it } from "vitest";
import { dividerCssRects, paneCssRects } from "./paneLayout";

describe("paneCssRects", () => {
  it("n=1 → single pane spans the whole canvas", () => {
    const rects = paneCssRects(1);
    expect(rects).toEqual([
      { left: "0%", top: "0%", width: "100%", height: "100%" },
    ]);
  });

  it("n=2 → left/right halves", () => {
    const rects = paneCssRects(2);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({
      left: "0%",
      top: "0%",
      width: "50%",
      height: "100%",
    });
    expect(rects[1]).toEqual({
      left: "50%",
      top: "0%",
      width: "50%",
      height: "100%",
    });
  });

  it("n=3 → y-flip puts the top row at top:0% and the bottom full-width row at top:50%", () => {
    const rects = paneCssRects(3);
    expect(rects).toHaveLength(3);
    // top-left
    expect(rects[0]).toEqual({
      left: "0%",
      top: "0%",
      width: "50%",
      height: "50%",
    });
    // top-right
    expect(rects[1]).toEqual({
      left: "50%",
      top: "0%",
      width: "50%",
      height: "50%",
    });
    // bottom, full width
    expect(rects[2]).toEqual({
      left: "0%",
      top: "50%",
      width: "100%",
      height: "50%",
    });
  });

  it("n=4 → 2×2 grid", () => {
    const rects = paneCssRects(4);
    expect(rects).toHaveLength(4);
    expect(rects[0]).toEqual({
      left: "0%",
      top: "0%",
      width: "50%",
      height: "50%",
    });
    expect(rects[1]).toEqual({
      left: "50%",
      top: "0%",
      width: "50%",
      height: "50%",
    });
    expect(rects[2]).toEqual({
      left: "0%",
      top: "50%",
      width: "50%",
      height: "50%",
    });
    expect(rects[3]).toEqual({
      left: "50%",
      top: "50%",
      width: "50%",
      height: "50%",
    });
  });
});

describe("dividerCssRects", () => {
  it("n<=1 → no dividers", () => {
    expect(dividerCssRects(0)).toEqual([]);
    expect(dividerCssRects(1)).toEqual([]);
  });

  it("n=2 → one vertical full-height divider", () => {
    const dividers = dividerCssRects(2);
    expect(dividers).toHaveLength(1);
    expect(dividers[0]).toEqual({
      left: "calc(50% - 0.5px)",
      top: "0%",
      width: "1px",
      height: "100%",
    });
  });

  it("n=3 → a horizontal center divider plus a top-half vertical divider", () => {
    const dividers = dividerCssRects(3);
    expect(dividers).toHaveLength(2);
    expect(dividers[0]).toEqual({
      left: "0%",
      top: "calc(50% - 0.5px)",
      width: "100%",
      height: "1px",
    });
    expect(dividers[1]).toEqual({
      left: "calc(50% - 0.5px)",
      top: "0%",
      width: "1px",
      height: "50%",
    });
  });

  it("n=4 → full vertical and full horizontal dividers (2×2 cross)", () => {
    const dividers = dividerCssRects(4);
    expect(dividers).toHaveLength(2);
    expect(dividers[0]).toEqual({
      left: "calc(50% - 0.5px)",
      top: "0%",
      width: "1px",
      height: "100%",
    });
    expect(dividers[1]).toEqual({
      left: "0%",
      top: "calc(50% - 0.5px)",
      width: "100%",
      height: "1px",
    });
  });
});
