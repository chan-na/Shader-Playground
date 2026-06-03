import { describe, expect, it } from "vitest";
import { buildPalette, mapToPalette } from "./quantize";

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
