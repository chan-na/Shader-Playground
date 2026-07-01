/**
 * Live external texture sources (webcam / video / audio). Lives as a module
 * singleton because the source's lifetime spans graph recompiles — calling
 * getUserMedia (or re-opening a decoded video) on every recompile would
 * re-prompt for permission and tear down/recreate the source, which is
 * unacceptable UX.
 *
 * Lifecycle:
 *   - `reconcileExternal(specs)` is called after each compile. Handles for
 *     missing node IDs are disposed; new node IDs get a fresh handle and
 *     start their acquisition; existing handles whose spec changed in a way
 *     that requires restart (deviceId swap / video assetId swap) restart,
 *     while non-restart changes (play/pause/loop/mute/seek) apply in place.
 *   - `updateExternalSources(gl)` is called once per RAF tick to upload
 *     the latest frame into the handle's GLTexture.
 *   - `getExternalTexture(nodeId)` is what `bindSamplers` looks up.
 *   - `disposeAllExternal(gl)` is called on viewport unmount.
 *
 * Handles do NOT live inside ExecutionPlan, because plan.dispose() runs on
 * every recompile and would otherwise nuke the camera every time the user
 * edits a shader.
 */

import { log, normalizeError } from "../../utils/log";

interface WebcamExternalSpec {
  nodeId: string;
  kind: "webcam";
  deviceId?: string;
}

interface VideoExternalSpec {
  nodeId: string;
  kind: "video";
  /** Asset id resolved via the registered video blob resolver. */
  assetId: string | null;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  /** Optional seek target (seconds). When this value changes the element
   *  seeks without restart; absent value leaves the playhead alone. */
  currentTime?: number;
}

interface AudioExternalSpec {
  nodeId: string;
  kind: "audio";
  sourceKind: "mic" | "file";
  /** File mode only. Resolved via the registered audio blob resolver. */
  assetId: string | null;
  /** Power of two from AUDIO_FFT_SIZES. */
  fftSize: number;
  smoothing: number;
  playing: boolean;
  loop: boolean;
}

export type ExternalSpec =
  | WebcamExternalSpec
  | VideoExternalSpec
  | AudioExternalSpec;

interface WebcamHandle {
  nodeId: string;
  kind: "webcam";
  spec: WebcamExternalSpec;
  stream: MediaStream | null;
  video: HTMLVideoElement;
  glTexture: WebGLTexture | null;
  width: number;
  height: number;
  /** True once the video element has produced at least one decodable frame. */
  ready: boolean;
  /** Last acquisition error (permission denial, no device, etc.). */
  error: string | null;
  disposed: boolean;
}

interface VideoHandle {
  nodeId: string;
  kind: "video";
  spec: VideoExternalSpec;
  /** Object URL created from the resolved Blob; revoked on dispose/restart. */
  objectUrl: string | null;
  video: HTMLVideoElement;
  glTexture: WebGLTexture | null;
  width: number;
  height: number;
  ready: boolean;
  error: string | null;
  disposed: boolean;
}

interface AudioHandle {
  nodeId: string;
  kind: "audio";
  spec: AudioExternalSpec;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  /** Mic mode: MediaStreamAudioSourceNode + its underlying MediaStream. */
  micStream: MediaStream | null;
  micSourceNode: MediaStreamAudioSourceNode | null;
  /** File mode: decoded buffer + currently playing source (may be null when
   *  paused or before first play). */
  buffer: AudioBuffer | null;
  bufferSource: AudioBufferSourceNode | null;
  /** Reusable Uint8Array sized to fftSize/2 — re-allocated when fftSize changes. */
  bins: Uint8Array | null;
  glTexture: WebGLTexture | null;
  /** Width = fftSize/2, height = 1 (1D R8 texture rendered as 2D Nx1). */
  width: number;
  height: number;
  ready: boolean;
  error: string | null;
  disposed: boolean;
}

type ExternalHandle = WebcamHandle | VideoHandle | AudioHandle;

const handles = new Map<string, ExternalHandle>();

/**
 * The GL context of the most recent frame upload. `reconcileExternal` runs
 * inside compile (no GL context in scope), so it stashes this to hand to
 * `disposeHandle` when tearing down a removed/kind-swapped/restarted source —
 * otherwise the GPU texture is orphaned (only its JS reference is nulled) and
 * leaks until context loss. Set by `updateExternalSources` every render tick.
 */
let lastRenderGl: WebGL2RenderingContext | null = null;

/**
 * Optional override for getUserMedia — tests inject a fake here so they do
 * not depend on the global MediaDevices API. When null, the real
 * navigator.mediaDevices.getUserMedia is used.
 */
type GetUserMedia = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;
let _getUserMedia: GetUserMedia | null = null;
export function __setGetUserMediaForTests(fn: GetUserMedia | null) {
  _getUserMedia = fn;
}

function resolveGetUserMedia(): GetUserMedia | null {
  if (_getUserMedia) return _getUserMedia;
  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  ) {
    return (c) => navigator.mediaDevices.getUserMedia(c);
  }
  return null;
}

/**
 * Resolver from assetId → Blob, wired by the asset store layer (or stubbed
 * in tests). Kept as a registered hook rather than a direct import so the
 * registry stays free of state-store dependencies.
 */
type VideoBlobResolver = (assetId: string) => Blob | null;
let _videoBlobResolver: VideoBlobResolver | null = null;
export function setVideoBlobResolver(fn: VideoBlobResolver | null) {
  _videoBlobResolver = fn;
}

/** Same shape as the video resolver but for audio files. */
type AudioBlobResolver = (assetId: string) => Blob | null;
let _audioBlobResolver: AudioBlobResolver | null = null;
export function setAudioBlobResolver(fn: AudioBlobResolver | null) {
  _audioBlobResolver = fn;
}

/**
 * Override the AudioContext constructor for tests so they don't depend on
 * the real Web Audio API (jsdom has no implementation). When null the
 * registry uses the global AudioContext / webkitAudioContext.
 */
type AudioContextFactory = () => AudioContext | null;
let _audioContextFactory: AudioContextFactory | null = null;
export function __setAudioContextFactoryForTests(
  fn: AudioContextFactory | null,
) {
  _audioContextFactory = fn;
}

function resolveAudioContextFactory(): AudioContextFactory | null {
  if (_audioContextFactory) return _audioContextFactory;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  return () => {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  };
}

/**
 * Bring the live registry in sync with the graph's current set of external
 * source nodes. Idempotent: calling with the same specs is a no-op.
 */
export function reconcileExternal(specs: ExternalSpec[]) {
  const ids = new Set(specs.map((s) => s.nodeId));
  // Release handles whose nodes were removed from the graph.
  for (const id of Array.from(handles.keys())) {
    if (!ids.has(id)) {
      const h = handles.get(id);
      if (h) disposeHandle(h, lastRenderGl ?? undefined);
    }
  }
  for (const spec of specs) {
    const existing = handles.get(spec.nodeId);
    if (existing) {
      if (existing.kind !== spec.kind) {
        // Kind switch on the same node id — tear down and re-acquire.
        disposeHandle(existing, lastRenderGl ?? undefined);
        handles.set(spec.nodeId, acquire(spec));
        continue;
      }
      if (needsRestart(existing, spec)) {
        disposeHandle(existing, lastRenderGl ?? undefined);
        handles.set(spec.nodeId, acquire(spec));
        continue;
      }
      // Apply in-place updates (video play/pause/loop/mute/seek). Webcam
      // currently has no in-place mutations.
      applyInPlace(existing, spec);
      continue;
    }
    handles.set(spec.nodeId, acquire(spec));
  }
}

export function getExternalTexture(nodeId: string): WebGLTexture | null {
  const h = handles.get(nodeId);
  return h?.glTexture ?? null;
}

export function getExternalStatus(nodeId: string): {
  ready: boolean;
  error: string | null;
  width: number;
  height: number;
} | null {
  const h = handles.get(nodeId);
  if (!h) return null;
  return {
    ready: h.ready,
    error: h.error,
    width: h.width,
    height: h.height,
  };
}

/**
 * Returns the underlying MediaStream so the node-card preview can mirror the
 * source into a <video> element of its own. Only webcam handles expose a
 * stream; video handles return null (preview mirrors via the registry's
 * <video> element directly through getExternalVideoElement).
 */
export function getExternalStream(nodeId: string): MediaStream | null {
  const h = handles.get(nodeId);
  if (!h || h.kind !== "webcam") return null;
  return h.stream;
}

/**
 * Returns the registry's underlying <video> element for a video handle so
 * the node-card preview can mirror frames without re-decoding. Returns null
 * for webcam handles (those use getExternalStream + srcObject).
 */
export function getExternalVideoElement(
  nodeId: string,
): HTMLVideoElement | null {
  const h = handles.get(nodeId);
  if (!h || h.kind !== "video") return null;
  return h.video;
}

/**
 * Returns the most recently sampled FFT bin array for an audio handle so the
 * node-card preview can render a mini spectrum without re-running an
 * AnalyserNode of its own. Returns null for non-audio handles or before the
 * first frame samples successfully.
 */
export function getExternalAudioBins(nodeId: string): Uint8Array | null {
  const h = handles.get(nodeId);
  if (!h || h.kind !== "audio") return null;
  return h.bins;
}

export function updateExternalSources(gl: WebGL2RenderingContext) {
  lastRenderGl = gl;
  for (const h of handles.values()) {
    uploadFrame(gl, h);
  }
}

export function disposeAllExternal(gl?: WebGL2RenderingContext) {
  for (const h of Array.from(handles.values())) {
    disposeHandle(h, gl);
  }
  handles.clear();
}

/** Test/diagnostic helper — number of currently-tracked external sources. */
export function externalHandleCount(): number {
  return handles.size;
}

function acquire(spec: ExternalSpec): ExternalHandle {
  if (spec.kind === "webcam") return acquireWebcam(spec);
  if (spec.kind === "video") return acquireVideo(spec);
  return acquireAudio(spec);
}

function needsRestart(existing: ExternalHandle, spec: ExternalSpec): boolean {
  if (existing.kind === "webcam" && spec.kind === "webcam") {
    return existing.spec.deviceId !== spec.deviceId;
  }
  if (existing.kind === "video" && spec.kind === "video") {
    return existing.spec.assetId !== spec.assetId;
  }
  if (existing.kind === "audio" && spec.kind === "audio") {
    // Source-kind switch, file swap, or fftSize change all require fresh
    // analyser + new texture sizing. Smoothing / playing / loop are in-place.
    return (
      existing.spec.sourceKind !== spec.sourceKind ||
      existing.spec.assetId !== spec.assetId ||
      existing.spec.fftSize !== spec.fftSize
    );
  }
  return false;
}

function applyInPlace(existing: ExternalHandle, spec: ExternalSpec) {
  if (existing.kind === "video" && spec.kind === "video") {
    applyVideoSpec(existing, spec);
  } else if (existing.kind === "audio" && spec.kind === "audio") {
    applyAudioSpec(existing, spec);
  }
  // Webcam has no in-place mutations today.
}

function uploadFrame(gl: WebGL2RenderingContext, h: ExternalHandle) {
  if (h.kind === "webcam") {
    updateWebcam(gl, h);
    return;
  }
  if (h.kind === "video") {
    updateVideo(gl, h);
    return;
  }
  updateAudio(gl, h);
}

function disposeHandle(h: ExternalHandle, gl?: WebGL2RenderingContext) {
  if (h.disposed) return;
  h.disposed = true;
  if (h.kind === "webcam") {
    if (h.stream) {
      for (const track of h.stream.getTracks()) track.stop();
      h.stream = null;
    }
    try {
      h.video.srcObject = null;
    } catch (e) {
      log.debug("external", "webcam srcObject reset failed", normalizeError(e));
    }
  } else if (h.kind === "video") {
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
  } else {
    // audio
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
  if (h.glTexture && gl) {
    gl.deleteTexture(h.glTexture);
  }
  h.glTexture = null;
  handles.delete(h.nodeId);
}

function createVideoElement(): HTMLVideoElement {
  // jsdom environments may not implement HTMLVideoElement fully; guard so
  // the registry stays usable in unit tests without a DOM.
  return typeof document !== "undefined"
    ? document.createElement("video")
    : ({} as HTMLVideoElement);
}

function acquireWebcam(spec: WebcamExternalSpec): WebcamHandle {
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
    log.warn("external", "webcam acquisition failed", normalizeError(e));
  }
}

function updateWebcam(gl: WebGL2RenderingContext, h: WebcamHandle) {
  if (h.disposed || !h.ready) return;
  uploadVideoFrameToTexture(gl, h, h.video);
}

function acquireVideo(spec: VideoExternalSpec): VideoHandle {
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
  const resolver = _videoBlobResolver;
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
    if (typeof spec.currentTime === "number") {
      try {
        handle.video.currentTime = spec.currentTime;
      } catch (e) {
        log.debug(
          "external",
          "video seek before metadata failed",
          normalizeError(e),
        );
      }
    }
    if (spec.playing && typeof handle.video.play === "function") {
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

function applyVideoSpec(handle: VideoHandle, spec: VideoExternalSpec) {
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

function updateVideo(gl: WebGL2RenderingContext, h: VideoHandle) {
  if (h.disposed || !h.ready) return;
  uploadVideoFrameToTexture(gl, h, h.video);
}

function acquireAudio(spec: AudioExternalSpec): AudioHandle {
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
    log.warn("external", "audio mic acquisition failed", normalizeError(e));
  }
}

async function startAudioFile(handle: AudioHandle) {
  const spec = handle.spec;
  if (!spec.assetId) {
    handle.error = "No audio asset selected";
    return;
  }
  const resolver = _audioBlobResolver;
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
    if (spec.playing) startAudioBufferSource(handle);
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

function applyAudioSpec(handle: AudioHandle, spec: AudioExternalSpec) {
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

function updateAudio(gl: WebGL2RenderingContext, h: AudioHandle) {
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

function uploadVideoFrameToTexture(
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
