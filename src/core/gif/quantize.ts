/**
 * Color quantization for GIF export (Phase 31).
 *
 * GIF images carry at most 256 palette colors. `buildPalette` reduces one or
 * more RGBA frames to a shared (global) palette via median-cut, and
 * `mapToPalette` maps an RGBA frame to per-pixel palette indices.
 *
 * Pure data-in / data-out — no DOM, no GL. A single global palette across all
 * frames keeps the encoder simple and the output small; the slight quality
 * cost is acceptable for short screen-recordings of shader output.
 */

/** RGB triplet with an occurrence weight, used during median-cut. */
interface ColorBucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

const CHANNELS: ReadonlyArray<"r" | "g" | "b"> = ["r", "g", "b"];

/** Spread a 5-bit channel value back across the full 0..255 range. */
function expand5(v5: number): number {
  return (v5 << 3) | (v5 >> 2);
}

/** Pack an RGB color into a 15-bit (rgb555) histogram key. */
function rgb555(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

/**
 * Build a shared palette (RGB triplets, ≤ maxColors entries) from the given
 * RGBA frames. Returns a `Uint8Array` of length `colorCount * 3`.
 */
export function buildPalette(
  frames: ReadonlyArray<Uint8Array>,
  maxColors: number,
): Uint8Array {
  const target = Math.max(2, Math.min(256, Math.floor(maxColors)));

  // Histogram over rgb555 cells keeps the working set bounded (≤32768 colors)
  // regardless of resolution or frame count.
  const hist = new Map<number, number>();
  for (const frame of frames) {
    for (let i = 0; i + 3 < frame.length; i += 4) {
      const key = rgb555(frame[i] ?? 0, frame[i + 1] ?? 0, frame[i + 2] ?? 0);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }

  const buckets: ColorBucket[] = [];
  for (const [key, count] of hist) {
    buckets.push({
      r: expand5((key >> 10) & 31),
      g: expand5((key >> 5) & 31),
      b: expand5(key & 31),
      count,
    });
  }

  if (buckets.length === 0) {
    // Empty input — emit a single black entry so the palette is never empty.
    return new Uint8Array([0, 0, 0]);
  }
  if (buckets.length <= target) {
    return paletteFromBoxes(buckets.map((b) => [b]));
  }

  return paletteFromBoxes(medianCut(buckets, target));
}

/** Median-cut: split boxes along their longest channel until we reach target. */
function medianCut(buckets: ColorBucket[], target: number): ColorBucket[][] {
  let boxes: ColorBucket[][] = [buckets];
  while (boxes.length < target) {
    let pick = -1;
    let widest = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (!box || box.length < 2) continue;
      const range = boxRange(box);
      if (range > widest) {
        widest = range;
        pick = i;
      }
    }
    if (pick < 0) break; // every box is a single color

    const box = boxes[pick];
    if (!box) break;
    const ch = longestChannel(box);
    box.sort((a, b) => a[ch] - b[ch]);

    let total = 0;
    for (const c of box) total += c.count;
    let acc = 0;
    let splitAt = 1;
    for (let i = 0; i < box.length; i++) {
      acc += box[i]?.count ?? 0;
      if (acc * 2 >= total) {
        splitAt = i + 1;
        break;
      }
    }
    splitAt = Math.max(1, Math.min(box.length - 1, splitAt));

    boxes = boxes
      .slice(0, pick)
      .concat([box.slice(0, splitAt), box.slice(splitAt)])
      .concat(boxes.slice(pick + 1));
  }
  return boxes;
}

/** Largest channel extent across a box (used to choose which box to split). */
function boxRange(box: ColorBucket[]): number {
  let max = 0;
  for (const ch of CHANNELS) {
    let lo = 255;
    let hi = 0;
    for (const c of box) {
      const v = c[ch];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo > max) max = hi - lo;
  }
  return max;
}

/** Channel ('r' | 'g' | 'b') with the largest extent within the box. */
function longestChannel(box: ColorBucket[]): "r" | "g" | "b" {
  let best: "r" | "g" | "b" = "r";
  let bestRange = -1;
  for (const ch of CHANNELS) {
    let lo = 255;
    let hi = 0;
    for (const c of box) {
      const v = c[ch];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo > bestRange) {
      bestRange = hi - lo;
      best = ch;
    }
  }
  return best;
}

/** Weighted-average each box into one palette color. */
function paletteFromBoxes(boxes: ColorBucket[][]): Uint8Array {
  const palette = new Uint8Array(boxes.length * 3);
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box || box.length === 0) continue;
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (const c of box) {
      r += c.r * c.count;
      g += c.g * c.count;
      b += c.b * c.count;
      total += c.count;
    }
    const inv = total > 0 ? 1 / total : 0;
    palette[i * 3] = Math.round(r * inv);
    palette[i * 3 + 1] = Math.round(g * inv);
    palette[i * 3 + 2] = Math.round(b * inv);
  }
  return palette;
}

/**
 * Map an RGBA frame to palette indices (one byte per pixel). A per-cell cache
 * (rgb555) bounds the nearest-color search to ≤32768 lookups per frame.
 */
export function mapToPalette(
  rgba: Uint8Array,
  palette: Uint8Array,
): Uint8Array {
  const colorCount = Math.floor(palette.length / 3);
  const out = new Uint8Array(Math.floor(rgba.length / 4));
  const cache = new Map<number, number>();
  for (let p = 0, i = 0; i + 3 < rgba.length; i += 4, p++) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const key = rgb555(r, g, b);
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = nearestColor(r, g, b, palette, colorCount);
      cache.set(key, idx);
    }
    out[p] = idx;
  }
  return out;
}

/** Linear nearest-color search (≤256 palette entries). */
function nearestColor(
  r: number,
  g: number,
  b: number,
  palette: Uint8Array,
  colorCount: number,
): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < colorCount; i++) {
    const dr = r - (palette[i * 3] ?? 0);
    const dg = g - (palette[i * 3 + 1] ?? 0);
    const db = b - (palette[i * 3 + 2] ?? 0);
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
