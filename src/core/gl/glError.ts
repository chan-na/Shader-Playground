// DEV-only WebGL error surfacing. `gl.getError()` forces a synchronous GPU
// flush, so every probe here no-ops entirely in production and callers must
// keep it off hot paths (or throttle). Setup-time call sites (program link,
// FBO setup) probe unconditionally; the draw loop probes behind a frame
// throttle. GLSL compile errors are handled separately by diagnostics.ts —
// this covers the GL runtime errors that have no other visibility.

import { log } from "../../utils/log";

export function glErrorName(code: number): string {
  switch (code) {
    case 0x0500:
      return "INVALID_ENUM";
    case 0x0501:
      return "INVALID_VALUE";
    case 0x0502:
      return "INVALID_OPERATION";
    case 0x0505:
      return "OUT_OF_MEMORY";
    case 0x0506:
      return "INVALID_FRAMEBUFFER_OPERATION";
    case 0x9242:
      return "CONTEXT_LOST_WEBGL";
    default:
      return `0x${code.toString(16)}`;
  }
}

/**
 * Probe and log the WebGL error flag. Returns the first error code seen (0 when
 * clean). DEV-only — returns 0 without touching the GL context in production.
 */
export function checkGlError(
  gl: WebGL2RenderingContext,
  context: string,
): number {
  if (!import.meta.env.DEV) return 0;
  const first = gl.getError();
  if (first === 0) return 0;
  // getError clears one flag per call; drain the rest (bounded) so a stale
  // error doesn't bleed into the next probe and misattribute its origin.
  let extra = 0;
  for (let i = 0; i < 16 && gl.getError() !== 0; i++) extra++;
  log.error(
    "gl",
    `${context}: ${glErrorName(first)}`,
    extra > 0 ? { code: first, additional: extra } : { code: first },
  );
  return first;
}
