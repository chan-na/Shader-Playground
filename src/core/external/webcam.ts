/**
 * Webcam source: getUserMedia stream mirrored into a muted <video> element
 * whose frames are uploaded every render tick. Lifecycle dispatch lives in
 * `registry.ts`; this module only knows how to acquire, update and release a
 * single webcam handle.
 */

import { log, normalizeError } from "../../utils/log";
import { resolveGetUserMedia } from "./resolvers";
import type { WebcamExternalSpec, WebcamHandle } from "./types";
import { createVideoElement, uploadVideoFrameToTexture } from "./videoFrame";

export function acquireWebcam(spec: WebcamExternalSpec): WebcamHandle {
  const video = createVideoElement();
  if ("muted" in video) {
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
  }
  const handle: WebcamHandle = {
    nodeId: spec.nodeId,
    kind: "webcam",
    spec,
    stream: null,
    video,
    glTexture: null,
    width: 0,
    height: 0,
    ready: false,
    error: null,
    errorName: null,
    disposed: false,
  };
  void startWebcam(handle, spec.deviceId);
  return handle;
}

async function startWebcam(handle: WebcamHandle, deviceId: string | undefined) {
  const getUserMedia = resolveGetUserMedia();
  if (!getUserMedia) {
    handle.error = "MediaDevices.getUserMedia is unavailable";
    return;
  }
  try {
    const constraints: MediaStreamConstraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    };
    const stream = await getUserMedia(constraints);
    if (handle.disposed) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    handle.stream = stream;
    if ("srcObject" in handle.video) {
      handle.video.srcObject = stream;
    }
    if (typeof handle.video.play === "function") {
      // play() may reject (autoplay policy) OR throw synchronously
      // (jsdom's HTMLMediaElement.play is not implemented). Both are
      // non-fatal — the underlying stream still flows.
      try {
        const p = handle.video.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {});
        }
      } catch (e) {
        log.debug("external", "webcam play() failed", normalizeError(e));
      }
    }
    handle.ready = true;
  } catch (e) {
    handle.error = String(e);
    handle.errorName = e instanceof DOMException ? e.name : null;
    log.warn("external", "webcam acquisition failed", normalizeError(e));
  }
}

export function updateWebcam(gl: WebGL2RenderingContext, h: WebcamHandle) {
  if (h.disposed || !h.ready) return;
  uploadVideoFrameToTexture(gl, h, h.video);
}

/** Webcam-specific teardown for `disposeHandle`: stop the stream's tracks
 *  and detach it from the element. */
export function releaseWebcam(h: WebcamHandle) {
  if (h.stream) {
    for (const track of h.stream.getTracks()) track.stop();
    h.stream = null;
  }
  try {
    h.video.srcObject = null;
  } catch (e) {
    log.debug("external", "webcam srcObject reset failed", normalizeError(e));
  }
}
