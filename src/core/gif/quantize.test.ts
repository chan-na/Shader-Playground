import { describe, expect, it } from "vitest";
import { buildPalette, mapToPalette, mapToPaletteDithered } from "./quantize";

/** Build a w×h solid RGBA frame (alpha = 255). */
function solidRgba(
  w: number,
  h: number,
  color: [number, number, number],
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = color[0];
    out[i * 4 + 1] = color[1];
    out[i * 4 + 2] = color[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Build an RGBA frame from a flat list of [r,g,b] triplets (alpha = 255). */
function frame(colors: ReadonlyArray<[number, number, number]>): Uint8Array {
  const out = new Uint8Array(colors.length * 4);
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    if (!c) continue;
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe("buildPalette", () => {
  it("returns a single black entry for empty input", () => {
    expect(Array.from(buildPalette([], 256))).toEqual([0, 0, 0]);
    expect(Array.from(buildPalette([new Uint8Array(0)], 256))).toEqual([
      0, 0, 0,
    ]);
  });

  it("preserves distinct colors exactly when they fit (rgb555 rounding aside)", () => {
    // 0 and 255 are fixed points of the 5-bit histogram round-trip.
    const f = frame([
      [0, 0, 0],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
    const pal = buildPalette([f], 256);
    expect(pal.length).toBe(4 * 3);
    const set = new Set<string>();
    for (let i = 0; i < pal.length; i += 3) {
      set.add(`${pal[i]},${pal[i + 1]},${pal[i + 2]}`);
    }
    expect(set).toEqual(new Set(["0,0,0", "255,0,0", "0,255,0", "0,0,255"]));
  });

  it("reduces a gradient to at most maxColors entries", () => {
    const colors: [number, number, number][] = [];
    for (let i = 0; i < 256; i++) colors.push([i, i, i]);
    const pal = buildPalette([frame(colors)], 8);
    expect(pal.length).toBe(8 * 3);
  });

  it("clamps maxColors into the 2..256 range", () => {
    const f = frame([
      [10, 20, 30],
      [200, 100, 50],
    ]);
    // maxColors below 2 is raised to 2.
    expect(buildPalette([f], 1).length).toBeGreaterThanOrEqual(2 * 3);
    // 512 distinct rgb555 cells (32 R × 16 G) → maxColors above 256 is capped.
    const many: [number, number, number][] = [];
    for (let i = 0; i < 512; i++) {
      many.push([(i & 31) << 3, ((i >> 5) & 31) << 3, 0]);
    }
    expect(buildPalette([frame(many)], 9999).length).toBe(256 * 3);
  });
});

describe("mapToPalette", () => {
  it("maps each pixel to the nearest palette index", () => {
    const palette = Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 0, 0]);
    const f = frame([
      [10, 10, 10], // → black (index 0)
      [240, 240, 240], // → white (index 1)
      [200, 20, 20], // → red (index 2)
    ]);
    expect(Array.from(mapToPalette(f, palette))).toEqual([0, 1, 2]);
  });

  it("produces one index per pixel", () => {
    const palette = Uint8Array.from([0, 0, 0, 255, 255, 255]);
    const f = frame([
      [0, 0, 0],
      [255, 255, 255],
      [0, 0, 0],
      [255, 255, 255],
    ]);
    const indices = mapToPalette(f, palette);
    expect(indices.length).toBe(4);
    expect(Array.from(indices)).toEqual([0, 1, 0, 1]);
  });

  it("round-trips through buildPalette for a small image", () => {
    const f = frame([
      [12, 34, 56],
      [200, 100, 0],
      [12, 34, 56],
      [0, 0, 0],
    ]);
    const pal = buildPalette([f], 256);
    const idx = mapToPalette(f, pal);
    // Reconstruct and check it is close to the source (5-bit quantization).
    for (let p = 0; p < idx.length; p++) {
      const i = (idx[p] ?? 0) * 3;
      expect(Math.abs((pal[i] ?? 0) - (f[p * 4] ?? 0))).toBeLessThanOrEqual(8);
    }
  });
});

describe("mapToPaletteDithered", () => {
  const blackWhite = Uint8Array.from([0, 0, 0, 255, 255, 255]);

  it("produces one in-range index per pixel", () => {
    const idx = mapToPaletteDithered(
      solidRgba(4, 3, [120, 120, 120]),
      blackWhite,
      4,
      3,
    );
    expect(idx.length).toBe(12);
    for (const i of idx) expect(i).toBeLessThan(2);
  });

  it("does not dither when a solid color sits exactly on a palette entry", () => {
    // Pure white against a black/white palette: zero error, every pixel index 1.
    const idx = mapToPaletteDithered(
      solidRgba(4, 4, [255, 255, 255]),
      blackWhite,
      4,
      4,
    );
    expect([...idx].every((i) => i === 1)).toBe(true);
  });

  it("diffuses a flat mid-gray into a balanced mix of both extremes", () => {
    // 50% gray has no palette entry, so error diffusion must spread it across
    // both black and white. The mean index lands near 0.5 (neither extreme
    // dominates), which plain nearest-color mapping could never produce.
    const w = 8;
    const h = 8;
    const idx = mapToPaletteDithered(
      solidRgba(w, h, [128, 128, 128]),
      blackWhite,
      w,
      h,
    );
    const ones = [...idx].filter((i) => i === 1).length;
    expect(ones).toBeGreaterThan(0);
    expect(ones).toBeLessThan(w * h);
    const mean = ones / (w * h);
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });

  it("handles a single-color palette without dividing by zero", () => {
    const single = Uint8Array.from([10, 20, 30]);
    const idx = mapToPaletteDithered(
      solidRgba(3, 3, [200, 200, 200]),
      single,
      3,
      3,
    );
    expect([...idx].every((i) => i === 0)).toBe(true);
  });
});
