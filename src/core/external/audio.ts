/**
 * Audio source: an AnalyserNode fed by the microphone (getUserMedia) or a
 * decoded audio asset, whose FFT bins are uploaded every render tick as an
 * Nx1 R8 texture. Lifecycle dispatch lives in `registry.ts`; this module only
 * knows how to acquire, update in place, upload and release a single audio
 * handle.
 */

import { log, normalizeError } from "../../utils/log";
import {
  getAudioBlobResolver,
  resolveAudioContextFactory,
  resolveGetUserMedia,
} from "./resolvers";
import type { AudioExternalSpec, AudioHandle } from "./types";

export function acquireAudio(spec: AudioExternalSpec): AudioHandle {
  const handle: AudioHandle = {
    nodeId: spec.nodeId,
    kind: "audio",
    spec,
    audioContext: null,
    analyser: null,
    micStream: null,
    micSourceNode: null,
    buffer: null,
    bufferSource: null,
    bins: null,
    glTexture: null,
    width: 0,
    height: 0,
    ready: false,
    error: null,
    errorName: null,
    disposed: false,
  };
  const factory = resolveAudioContextFactory();
  if (!factory) {
    handle.error = "AudioContext is unavailable";
    return handle;
  }
  const ctx = factory();
  if (!ctx) {
    handle.error = "AudioContext could not be created";
    return handle;
  }
  handle.audioContext = ctx;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = spec.fftSize;
  analyser.smoothingTimeConstant = clamp01(spec.smoothing);
  handle.analyser = analyser;
  handle.bins = new Uint8Array(analyser.frequencyBinCount);

  if (spec.sourceKind === "mic") {
    void startAudioMic(handle);
  } else {
    void startAudioFile(handle);
  }
  return handle;
}

async function startAudioMic(handle: AudioHandle) {
  const getUserMedia = resolveGetUserMedia();
  if (!getUserMedia) {
    handle.error = "MediaDevices.getUserMedia is unavailable";
    return;
  }
  try {
    const stream = await getUserMedia({ audio: true, video: false });
    if (handle.disposed) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    handle.micStream = stream;
    const ctx = handle.audioContext;
    const analyser = handle.analyser;
    if (!ctx || !analyser) return;
    // Some browsers start the context suspended until a user gesture. Try to
    // resume — failure is non-fatal (the analyser still gets data once the
    // gesture finally happens). resume() may also throw synchronously in
    // older WebKit; both forms are swallowed here.
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {
      log.debug(
        "external",
        "audio context resume (mic) failed",
        normalizeError(e),
      );
    }
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    handle.micSourceNode = src;
    handle.ready = true;
  } catch (e) {
    handle.error = String(e);
    handle.errorName = e instanceof DOMException ? e.name : null;
    log.warn("external", "audio mic acquisition failed", normalizeError(e));
  }
}

async function startAudioFile(handle: AudioHandle) {
  const spec = handle.spec;
  if (!spec.assetId) {
    handle.error = "No audio asset selected";
    return;
  }
  const resolver = getAudioBlobResolver();
  if (!resolver) {
    handle.error = "Audio blob resolver not registered";
    return;
  }
  const blob = resolver(spec.assetId);
  if (!blob) {
    handle.error = "Audio asset not found";
    return;
  }
  const ctx = handle.audioContext;
  const analyser = handle.analyser;
  if (!ctx || !analyser) return;
  try {
    const buf = await blob.arrayBuffer();
    if (handle.disposed) return;
    const audioBuffer = await ctx.decodeAudioData(buf);
    if (handle.disposed) return;
    handle.buffer = audioBuffer;
    handle.ready = true;
    // Read the LIVE spec, not the one captured at entry: applyAudioSpec may
    // have toggled `playing` while decodeAudioData was in flight (that toggle
    // was a no-op because buffer was still null), so the captured value is
    // stale and would silently drop a Play issued during decode.
    if (handle.spec.playing) startAudioBufferSource(handle);
  } catch (e) {
    handle.error = String(e);
    log.warn("external", "audio file decode failed", normalizeError(e));
  }
}

function startAudioBufferSource(handle: AudioHandle) {
  const ctx = handle.audioContext;
  const analyser = handle.analyser;
  const buffer = handle.buffer;
  if (!ctx || !analyser || !buffer) return;
  if (handle.bufferSource) return;
  // Same resume() rationale as mic mode.
  try {
    const p = ctx.resume();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {
    log.debug(
      "external",
      "audio context resume (file) failed",
      normalizeError(e),
    );
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = handle.spec.loop;
  source.connect(analyser);
  try {
    source.start(0);
  } catch {
    // start() throws if called twice on the same source — we already guard
    // with the early return above but keep this defensive.
    return;
  }
  handle.bufferSource = source;
}

function stopAudioBufferSource(handle: AudioHandle) {
  if (!handle.bufferSource) return;
  try {
    handle.bufferSource.stop();
  } catch (e) {
    log.debug("external", "bufferSource.stop failed", normalizeError(e));
  }
  try {
    handle.bufferSource.disconnect();
  } catch (e) {
    log.debug("external", "bufferSource.disconnect failed", normalizeError(e));
  }
  handle.bufferSource = null;
}

export function applyAudioSpec(handle: AudioHandle, spec: AudioExternalSpec) {
  const prev = handle.spec;
  handle.spec = spec;
  if (handle.analyser && prev.smoothing !== spec.smoothing) {
    handle.analyser.smoothingTimeConstant = clamp01(spec.smoothing);
  }
  if (handle.bufferSource && prev.loop !== spec.loop) {
    handle.bufferSource.loop = spec.loop;
  }
  if (prev.playing !== spec.playing) {
    if (spec.playing) {
      // Mic mode is always "playing" — no-op on play toggles. File mode
      // needs a fresh AudioBufferSourceNode because they can't be restarted.
      if (spec.sourceKind === "file" && handle.buffer) {
        startAudioBufferSource(handle);
      }
    } else if (spec.sourceKind === "file") {
      stopAudioBufferSource(handle);
    }
  }
}

export function updateAudio(gl: WebGL2RenderingContext, h: AudioHandle) {
  if (h.disposed || !h.ready || !h.analyser || !h.bins) return;
  h.analyser.getByteFrequencyData(h.bins);
  uploadAudioBinsToTexture(gl, h);
}

function uploadAudioBinsToTexture(gl: WebGL2RenderingContext, h: AudioHandle) {
  if (!h.bins) return;
  const w = h.bins.length;
  if (!w) return;

  if (!h.glTexture || h.width !== w || h.height !== 1) {
    if (h.glTexture) gl.deleteTexture(h.glTexture);
    const tex = gl.createTexture();
    if (!tex) return;
    h.glTexture = tex;
    h.width = w;
    h.height = 1;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // R8 single-channel — shaders read with .r and treat as 0..1 normalized.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      w,
      1,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      h.bins,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, h.glTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    w,
    1,
    gl.RED,
    gl.UNSIGNED_BYTE,
    h.bins,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Audio-specific teardown for `disposeHandle`: stop playback, release the
 *  mic stream, and tear down the Web Audio graph. */
export function releaseAudio(h: AudioHandle) {
  if (h.bufferSource) {
    try {
      h.bufferSource.stop();
    } catch (e) {
      log.debug(
        "external",
        "bufferSource.stop on dispose failed",
        normalizeError(e),
      );
    }
    try {
      h.bufferSource.disconnect();
    } catch (e) {
      log.debug(
        "external",
        "bufferSource.disconnect failed",
        normalizeError(e),
      );
    }
    h.bufferSource = null;
  }
  if (h.micSourceNode) {
    try {
      h.micSourceNode.disconnect();
    } catch (e) {
      log.debug(
        "external",
        "micSourceNode.disconnect failed",
        normalizeError(e),
      );
    }
    h.micSourceNode = null;
  }
  if (h.micStream) {
    for (const track of h.micStream.getTracks()) track.stop();
    h.micStream = null;
  }
  if (h.analyser) {
    try {
      h.analyser.disconnect();
    } catch (e) {
      log.debug("external", "analyser.disconnect failed", normalizeError(e));
    }
    h.analyser = null;
  }
  if (h.audioContext) {
    // close() returns a Promise — we don't await on dispose paths.
    try {
      void h.audioContext.close();
    } catch (e) {
      log.debug("external", "audioContext.close failed", normalizeError(e));
    }
    h.audioContext = null;
  }
  h.buffer = null;
  h.bins = null;
}
