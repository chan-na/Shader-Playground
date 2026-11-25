/**
 * Video file source: an imported video asset resolved to a Blob, decoded by
 * a <video> element whose frames are uploaded every render tick. Lifecycle
 * dispatch lives in `registry.ts`; this module only knows how to acquire,
 * update in place, upload and release a single video handle.
 */

import { log, normalizeError } from "../../utils/log";
import { getVideoBlobResolver } from "./resolvers";
import type { VideoExternalSpec, VideoHandle } from "./types";
import { createVideoElement, uploadVideoFrameToTexture } from "./videoFrame";

export function acquireVideo(spec: VideoExternalSpec): VideoHandle {
  const video = createVideoElement();
  if ("muted" in video) {
    video.muted = spec.muted;
    video.loop = spec.loop;
    video.playsInline = true;
    // autoplay only kicks in once src is set; we control play() manually.
  }
  const handle: VideoHandle = {
    nodeId: spec.nodeId,
    kind: "video",
    spec,
    objectUrl: null,
    video,
    glTexture: null,
    width: 0,
    height: 0,
    ready: false,
    error: null,
    disposed: false,
  };
  if (!spec.assetId) {
    handle.error = "No video asset selected";
    return handle;
  }
  const resolver = getVideoBlobResolver();
  if (!resolver) {
    handle.error = "Video blob resolver not registered";
    return handle;
  }
  const blob = resolver(spec.assetId);
  if (!blob) {
    handle.error = "Video asset not found";
    return handle;
  }
  try {
    handle.objectUrl = URL.createObjectURL(blob);
  } catch (e) {
    handle.error = String(e);
    log.warn("external", "video object URL creation failed", normalizeError(e));
    return handle;
  }
  if ("src" in handle.video) {
    handle.video.src = handle.objectUrl;
  }
  const onReady = () => {
    if (handle.disposed) return;
    handle.ready = true;
    // `spec` is the acquire-time snapshot. Decoding metadata takes a few frames,
    // and `applyInPlace`/`applyVideoSpec` may have swapped in a newer spec while
    // we waited — pausing, seeking, or muting. Honour the *live* spec so a pause
    // issued during load isn't undone by a stale autoplay.
    const live = handle.spec;
    if (typeof live.currentTime === "number") {
      try {
        handle.video.currentTime = live.currentTime;
      } catch (e) {
        log.debug(
          "external",
          "video seek before metadata failed",
          normalizeError(e),
        );
      }
    }
    if (live.playing && typeof handle.video.play === "function") {
      try {
        const p = handle.video.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) {
        log.debug("external", "video play() failed", normalizeError(e));
      }
    }
  };
  if (typeof handle.video.addEventListener === "function") {
    handle.video.addEventListener("loadeddata", onReady, { once: true });
    handle.video.addEventListener(
      "error",
      () => {
        if (handle.disposed) return;
        handle.error = "Video load error";
      },
      { once: true },
    );
  } else {
    // jsdom path — mark ready synchronously so unit tests can observe state.
    onReady();
  }
  if (typeof handle.video.load === "function") {
    try {
      handle.video.load();
    } catch (e) {
      log.debug("external", "video load() failed", normalizeError(e));
    }
  }
  return handle;
}

export function applyVideoSpec(handle: VideoHandle, spec: VideoExternalSpec) {
  const prev = handle.spec;
  handle.spec = spec;
  const v = handle.video;
  if (prev.loop !== spec.loop && "loop" in v) {
    v.loop = spec.loop;
  }
  if (prev.muted !== spec.muted && "muted" in v) {
    v.muted = spec.muted;
  }
  if (prev.playing !== spec.playing) {
    if (spec.playing && typeof v.play === "function") {
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) {
        log.debug("external", "video play() toggle failed", normalizeError(e));
      }
    } else if (!spec.playing && typeof v.pause === "function") {
      try {
        v.pause();
      } catch (e) {
        log.debug("external", "video pause() toggle failed", normalizeError(e));
      }
    }
  }
  if (
    typeof spec.currentTime === "number" &&
    spec.currentTime !== prev.currentTime &&
    "currentTime" in v
  ) {
    try {
      v.currentTime = spec.currentTime;
    } catch (e) {
      log.debug("external", "video currentTime seek failed", normalizeError(e));
    }
  }
}

export function updateVideo(gl: WebGL2RenderingContext, h: VideoHandle) {
  if (h.disposed || !h.ready) return;
  uploadVideoFrameToTexture(gl, h, h.video);
}

/** Video-specific teardown for `disposeHandle`: stop decoding and revoke
 *  the asset's object URL. */
export function releaseVideo(h: VideoHandle) {
  try {
    if (typeof h.video.pause === "function") h.video.pause();
    h.video.removeAttribute("src");
    h.video.load?.();
  } catch (e) {
    log.debug("external", "video element teardown failed", normalizeError(e));
  }
  if (h.objectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
    try {
      URL.revokeObjectURL(h.objectUrl);
    } catch (e) {
      log.debug("external", "revokeObjectURL failed", normalizeError(e));
    }
  }
  h.objectUrl = null;
}
