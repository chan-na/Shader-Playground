import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export interface PixelStats {
  width: number;
  height: number;
  total: number;
  /** Pixels with any non-zero channel (after alpha unmultiply). */
  nonZero: number;
  /** Average RGB across non-zero pixels (0-255). */
  avg: { r: number; g: number; b: number };
  /** Largest absolute channel spread (range), 0-255. */
  spread: number;
}

/**
 * A sub-rectangle of the canvas in backing-store pixel space, top-down
 * (0,0 = top-left of the rendered image) — i.e. the same orientation
 * `drawImage`/screen readers use, *not* WebGL's bottom-left-origin viewport
 * space. See `splitCellToImageRect` for converting `splitLayout()` cells.
 */
export interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Snapshot the canvas via a 2D sampling context (cheap downsample). We don't
 * grab the full canvas — SwiftShader on CI is slow and exact pixels are not
 * the assertion. We just want "did anything draw?" / "is the frame uniform?"
 *
 * The Viewport uses `preserveDrawingBuffer: false`, so the WebGL drawing
 * buffer is invalidated after compositing. We synchronize via two nested
 * `requestAnimationFrame` callbacks — the inner rAF fires immediately after
 * the next draw, while the buffer is still valid.
 */
export async function readCanvasStats(
  canvas: Locator,
  rect?: CanvasRect,
): Promise<PixelStats> {
  return canvas.evaluate(async (c, rect) => {
    const cv = c as HTMLCanvasElement;
    const W = 32;
    const H = 32;
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const ctx = off.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (rect) {
            ctx.drawImage(cv, rect.x, rect.y, rect.w, rect.h, 0, 0, W, H);
          } else {
            ctx.drawImage(cv, 0, 0, W, H);
          }
          resolve();
        });
      });
    });
    const data = ctx.getImageData(0, 0, W, H).data;
    let nonZero = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let rMin = 255;
    let gMin = 255;
    let bMin = 255;
    let rMax = 0;
    let gMax = 0;
    let bMax = 0;
    const total = W * H;
    for (let i = 0; i < total; i++) {
      const r = data[i * 4] ?? 0;
      const g = data[i * 4 + 1] ?? 0;
      const b = data[i * 4 + 2] ?? 0;
      if (r > 0 || g > 0 || b > 0) {
        nonZero++;
        rSum += r;
        gSum += g;
        bSum += b;
      }
      if (r < rMin) rMin = r;
      if (g < gMin) gMin = g;
      if (b < bMin) bMin = b;
      if (r > rMax) rMax = r;
      if (g > gMax) gMax = g;
      if (b > bMax) bMax = b;
    }
    const denom = Math.max(1, nonZero);
    return {
      width: W,
      height: H,
      total,
      nonZero,
      avg: {
        r: rSum / denom,
        g: gSum / denom,
        b: bSum / denom,
      },
      spread: Math.max(rMax - rMin, gMax - gMin, bMax - bMin),
    };
  }, rect);
}

/** Poll until at least `ratio` (default 5%) of sampled pixels are non-zero. */
export async function expectCanvasRendered(
  canvas: Locator,
  opts: { ratio?: number; timeout?: number } = {},
): Promise<PixelStats> {
  const ratio = opts.ratio ?? 0.05;
  let last: PixelStats | null = null;
  await expect
    .poll(
      async () => {
        last = await readCanvasStats(canvas);
        return last.nonZero / last.total;
      },
      {
        timeout: opts.timeout ?? 10_000,
        intervals: [100, 200, 500, 1000],
        message: `canvas remained mostly empty (need ratio >= ${ratio})`,
      },
    )
    .toBeGreaterThanOrEqual(ratio);
  if (!last) throw new Error("poll never populated stats");
  return last;
}

/**
 * Converts a `splitLayout()` cell (WebGL viewport space: origin bottom-left,
 * y-up) into the top-down image-space rect `readCanvasStats`/`drawImage`
 * expect. `canvasHeight` must be the same backing-store height the cell was
 * computed against.
 */
export function splitCellToImageRect(
  cell: { x: number; y: number; w: number; h: number },
  canvasHeight: number,
): CanvasRect {
  return {
    x: cell.x,
    y: canvasHeight - (cell.y + cell.h),
    w: cell.w,
    h: cell.h,
  };
}

/**
 * Like `expectCanvasRendered`, but polls a single sub-rectangle of the
 * canvas (see `splitCellToImageRect`) instead of the whole image. A
 * multi-output split view dilutes a global ratio check — one missing cell
 * out of N barely nudges it — whereas sampling each cell independently
 * catches that specific cell going blank directly.
 */
export async function expectCanvasCellRendered(
  canvas: Locator,
  rect: CanvasRect,
  opts: { ratio?: number; timeout?: number } = {},
): Promise<PixelStats> {
  const ratio = opts.ratio ?? 0.05;
  let last: PixelStats | null = null;
  await expect
    .poll(
      async () => {
        last = await readCanvasStats(canvas, rect);
        return last.nonZero / last.total;
      },
      {
        timeout: opts.timeout ?? 10_000,
        intervals: [100, 200, 500, 1000],
        message: `canvas cell ${JSON.stringify(rect)} remained mostly empty (need ratio >= ${ratio})`,
      },
    )
    .toBeGreaterThanOrEqual(ratio);
  if (!last) throw new Error("poll never populated stats");
  return last;
}
