import type { Framebuffer } from '../gl/framebuffer';

export const THUMB_SIZE = 96;

const _scratch = new Uint8Array(THUMB_SIZE * THUMB_SIZE * 4);
const _scratchClamped = new Uint8ClampedArray(_scratch.buffer);

/**
 * Reads back the FBO color attachment at THUMB_SIZE×THUMB_SIZE using nearest-style
 * downsampling (read full size into a temp, then box-filter average to thumb).
 * Falls back to direct readPixels at THUMB_SIZE for tiny FBOs to avoid waste.
 *
 * Returns an ImageData (RGBA, premultiplied not assumed) ready for putImageData.
 */
export function readbackThumbnail(
  gl: WebGL2RenderingContext,
  fb: Framebuffer,
): ImageData {
  // Read the full FBO (or a stride of it) at native resolution.
  const w = fb.width;
  const h = fb.height;
  const blockW = Math.max(1, Math.floor(w / THUMB_SIZE));
  const blockH = Math.max(1, Math.floor(h / THUMB_SIZE));

  // Bind FBO and readPixels
  const prevFB = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.fbo);

  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  // Box-filter downsample to THUMB_SIZE×THUMB_SIZE.
  const out = _scratch;
  for (let ty = 0; ty < THUMB_SIZE; ty++) {
    const sy0 = Math.floor((ty / THUMB_SIZE) * h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) / THUMB_SIZE) * h));
    for (let tx = 0; tx < THUMB_SIZE; tx++) {
      const sx0 = Math.floor((tx / THUMB_SIZE) * w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) / THUMB_SIZE) * w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      // Sample at fixed strides for speed (avoid quadratic average over the whole FBO)
      const dx = Math.max(1, Math.floor((sx1 - sx0) / 2));
      const dy = Math.max(1, Math.floor((sy1 - sy0) / 2));
      for (let sy = sy0; sy < sy1; sy += dy) {
        // FBO is bottom-up; flip vertically here.
        const flipped = h - 1 - sy;
        const rowStart = flipped * w * 4;
        for (let sx = sx0; sx < sx1; sx += dx) {
          const i = rowStart + sx * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
          n++;
        }
      }
      const oi = (ty * THUMB_SIZE + tx) * 4;
      const inv = n > 0 ? 1 / n : 0;
      out[oi] = r * inv;
      out[oi + 1] = g * inv;
      out[oi + 2] = b * inv;
      out[oi + 3] = a * inv || 255;
    }
  }

  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevFB);
  // Mark blockW/H as used to avoid TS warning
  void blockW;
  void blockH;

  // Copy out so callers can hold onto the ImageData independently of _scratch
  const copy = new Uint8ClampedArray(_scratchClamped);
  return new ImageData(copy, THUMB_SIZE, THUMB_SIZE);
}
