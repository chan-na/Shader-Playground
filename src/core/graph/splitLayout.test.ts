import { describe, expect, it } from "vitest";
import { splitLayout } from "./execute";

describe("splitLayout", () => {
  it("1 → full canvas", () => {
    const cells = splitLayout(1, 800, 600);
    expect(cells).toEqual([{ x: 0, y: 0, w: 800, h: 600 }]);
  });

  it("2 → left/right halves", () => {
    const cells = splitLayout(2, 800, 600);
    expect(cells).toHaveLength(2);
    expect(cells[0].x).toBe(0);
    expect(cells[1].x).toBe(400);
    expect(cells[0].w + cells[1].w).toBe(800);
    expect(cells[0].h).toBe(600);
  });

  it("3 → 2 on top, 1 below", () => {
    const cells = splitLayout(3, 800, 600);
    expect(cells).toHaveLength(3);
    // Top cells split horizontally
    expect(cells[0].w + cells[1].w).toBe(800);
    expect(cells[0].h).toBe(cells[1].h);
    // Bottom cell spans full width
    expect(cells[2].w).toBe(800);
    // Stack
    expect(cells[0].y + cells[0].h).toBe(600);
    expect(cells[2].y).toBe(0);
  });

  it("4 → 2×2 grid", () => {
    const cells = splitLayout(4, 800, 600);
    expect(cells).toHaveLength(4);
    // Each cell ~400×300
    for (const c of cells) {
      expect(c.w).toBeGreaterThanOrEqual(399);
      expect(c.h).toBeGreaterThanOrEqual(299);
    }
  });

  it("5+ clamps to 4", () => {
    expect(splitLayout(7, 800, 600)).toHaveLength(4);
  });

  it("odd canvas sizes still tile losslessly horizontally", () => {
    const cells = splitLayout(2, 801, 600);
    expect(cells[0].w + cells[1].w).toBe(801);
  });
});
