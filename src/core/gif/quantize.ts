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

/** Clamp a (possibly fractional) channel value into the 0..255 byte range. */
function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

/**
 * Map an RGBA frame to palette indices with Floyd–Steinberg error diffusion
 * (Phase 33). Each pixel's quantization error is spread to its yet-unvisited
 * neighbours (right 7/16, below-left 3/16, below 5/16, below-right 1/16), which
 * trades hard banding for fine dithering noise — a large quality win on the
 * gradients typical of shader output. No per-cell cache: error accumulation
 * makes identical source colors map differently, so every pixel runs the
 * nearest-color search (bounded by ≤256 palette entries; offloaded to the
 * worker since Phase 32).
 */
export function mapToPaletteDithered(
  rgba: Uint8Array,
  palette: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const colorCount = Math.floor(palette.length / 3);
  const out = new Uint8Array(Math.max(0, width * height));
  // Error carried into the current row and accumulated for the next one (RGB
  // interleaved). `curr` is read+updated as we walk left→right; `next` becomes
  // `curr` at the end of each row.
  const curr = new Float32Array(width * 3);
  const next = new Float32Array(width * 3);
  const spread = (
    buf: Float32Array,
    x: number,
    dr: number,
    dg: number,
    db: number,
    factor: number,
  ): void => {
    const j = x * 3;
    buf[j] = (buf[j] ?? 0) + dr * factor;
    buf[j + 1] = (buf[j + 1] ?? 0) + dg * factor;
    buf[j + 2] = (buf[j + 2] ?? 0) + db * factor;
  };

  for (let y = 0; y < height; y++) {
    next.fill(0);
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const r = clamp255((rgba[i] ?? 0) + (curr[x * 3] ?? 0));
      const g = clamp255((rgba[i + 1] ?? 0) + (curr[x * 3 + 1] ?? 0));
      const b = clamp255((rgba[i + 2] ?? 0) + (curr[x * 3 + 2] ?? 0));
      const idx = nearestColor(r, g, b, palette, colorCount);
      out[p] = idx;
      const dr = r - (palette[idx * 3] ?? 0);
      const dg = g - (palette[idx * 3 + 1] ?? 0);
      const db = b - (palette[idx * 3 + 2] ?? 0);
      if (x + 1 < width) spread(curr, x + 1, dr, dg, db, 7 / 16);
      if (y + 1 < height) {
        if (x > 0) spread(next, x - 1, dr, dg, db, 3 / 16);
        spread(next, x, dr, dg, db, 5 / 16);
        if (x + 1 < width) spread(next, x + 1, dr, dg, db, 1 / 16);
      }
    }
    curr.set(next);
  }
  return out;
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
