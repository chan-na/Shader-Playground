// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + bounded pixel sampling loop
export const THUMB_SIZE = 96;

const _scratch = new Uint8Array(THUMB_SIZE * THUMB_SIZE * 4);
const _scratchClamped = new Uint8ClampedArray(_scratch.buffer);

/**
 * Box-filter downsamples a tightly-packed RGBA8 buffer of size `w×h` into a
 * `thumb×thumb` ImageData. The source is assumed to be GL bottom-up; the
 * output is top-down (browser convention). Sampling strides are coarse so
 * the cost is roughly thumb² rather than w·h.
 */
export function downsampleToThumb(
  buf: Uint8Array,
  w: number,
  h: number,
  thumb = THUMB_SIZE,
): ImageData {
  // Re-use the module scratch buffer only for the canonical thumb size to
  // avoid leaking module state across odd sizes (tests may call with custom).
  const out =
    thumb === THUMB_SIZE ? _scratch : new Uint8Array(thumb * thumb * 4);
  for (let ty = 0; ty < thumb; ty++) {
    const sy0 = Math.floor((ty / thumb) * h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) / thumb) * h));
    for (let tx = 0; tx < thumb; tx++) {
      const sx0 = Math.floor((tx / thumb) * w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) / thumb) * w));
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      const dx = Math.max(1, Math.floor((sx1 - sx0) / 2));
      const dy = Math.max(1, Math.floor((sy1 - sy0) / 2));
      for (let sy = sy0; sy < sy1; sy += dy) {
        const flipped = h - 1 - sy;
        const rowStart = flipped * w * 4;
        for (let sx = sx0; sx < sx1; sx += dx) {
          const i = rowStart + sx * 4;
          r += buf[i]!;
          g += buf[i + 1]!;
          b += buf[i + 2]!;
          a += buf[i + 3]!;
          n++;
        }
      }
      const oi = (ty * thumb + tx) * 4;
      const inv = n > 0 ? 1 / n : 0;
      out[oi] = r * inv;
      out[oi + 1] = g * inv;
      out[oi + 2] = b * inv;
      out[oi + 3] = a * inv || 255;
    }
  }
  const copy =
    thumb === THUMB_SIZE
      ? new Uint8ClampedArray(_scratchClamped)
      : new Uint8ClampedArray(out.buffer.slice(0));
  return new ImageData(copy, thumb, thumb);
}
