/**
 * HTMLVideoElement helpers shared by the webcam and video sources: element
 * creation and the per-tick frame upload into the handle's GL texture.
 */

import type { VideoHandle, WebcamHandle } from "./types";

export function createVideoElement(): HTMLVideoElement {
  // jsdom environments may not implement HTMLVideoElement fully; guard so
  // the registry stays usable in unit tests without a DOM.
  return typeof document !== "undefined"
    ? document.createElement("video")
    : ({} as HTMLVideoElement);
}

export function uploadVideoFrameToTexture(
  gl: WebGL2RenderingContext,
  h: WebcamHandle | VideoHandle,
  v: HTMLVideoElement,
) {
  if (typeof v.readyState !== "number" || v.readyState < 2) return;
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  if (!vw || !vh) return;

  if (!h.glTexture || h.width !== vw || h.height !== vh) {
    if (h.glTexture) gl.deleteTexture(h.glTexture);
    const tex = gl.createTexture();
    if (!tex) return;
    h.glTexture = tex;
    h.width = vw;
    h.height = vh;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, h.glTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.bindTexture(gl.TEXTURE_2D, null);
}
