/**
 * Live external texture sources (webcam / video / audio). Lives as a module
 * singleton because the source's lifetime spans graph recompiles — calling
 * getUserMedia on every recompile would re-prompt for permission and tear
 * down/recreate the MediaStream, which is unacceptable UX.
 *
 * Lifecycle:
 *   - `reconcileExternal(specs)` is called after each compile. Handles for
 *     missing node IDs are disposed; new node IDs get a fresh handle and
 *     start their acquisition; existing handles whose spec changed
 *     (e.g. deviceId swap) restart.
 *   - `updateExternalSources(gl)` is called once per RAF tick to upload
 *     the latest video frame into the handle's GLTexture.
 *   - `getExternalTexture(nodeId)` is what `bindSamplers` looks up.
 *   - `disposeAllExternal(gl)` is called on viewport unmount.
 *
 * Handles do NOT live inside ExecutionPlan, because plan.dispose() runs on
 * every recompile and would otherwise nuke the camera every time the user
 * edits a shader.
 */

export interface ExternalSpec {
  nodeId: string;
  kind: "webcam";
  deviceId?: string;
}

interface WebcamHandle {
  nodeId: string;
  kind: "webcam";
  /** Last-seen deviceId from the spec — restart when it changes. */
  deviceId: string | undefined;
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

type ExternalHandle = WebcamHandle;

const handles = new Map<string, ExternalHandle>();

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
 * Bring the live registry in sync with the graph's current set of external
 * source nodes. Idempotent: calling with the same specs is a no-op.
 */
export function reconcileExternal(specs: ExternalSpec[]) {
  const ids = new Set(specs.map((s) => s.nodeId));
  // Release handles whose nodes were removed from the graph.
  for (const id of Array.from(handles.keys())) {
    if (!ids.has(id)) {
      const h = handles.get(id);
      if (h) disposeHandle(h);
    }
  }
  for (const spec of specs) {
    const existing = handles.get(spec.nodeId);
    if (existing) {
      if (existing.kind === "webcam" && existing.deviceId !== spec.deviceId) {
        disposeHandle(existing);
        handles.set(spec.nodeId, acquireWebcam(spec));
      }
      continue;
    }
    handles.set(spec.nodeId, acquireWebcam(spec));
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
 * source into a <video> element of its own. The webcam stream is owned by the
 * registry's video element and is safe to attach as srcObject to additional
 * preview videos.
 */
export function getExternalStream(nodeId: string): MediaStream | null {
  const h = handles.get(nodeId);
  return h?.stream ?? null;
}

export function updateExternalSources(gl: WebGL2RenderingContext) {
  for (const h of handles.values()) {
    if (h.kind === "webcam") updateWebcam(gl, h);
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

function disposeHandle(h: ExternalHandle, gl?: WebGL2RenderingContext) {
  if (h.disposed) return;
  h.disposed = true;
  if (h.stream) {
    for (const track of h.stream.getTracks()) track.stop();
    h.stream = null;
  }
  // Detach srcObject so the video element releases its reference.
  try {
    h.video.srcObject = null;
  } catch {
    // ignore — some test environments stub the property
  }
  if (h.glTexture && gl) {
    gl.deleteTexture(h.glTexture);
  }
  h.glTexture = null;
  handles.delete(h.nodeId);
}

function acquireWebcam(spec: ExternalSpec): WebcamHandle {
  // jsdom environments may not implement HTMLVideoElement fully; guard so
  // the registry stays usable in unit tests without a DOM.
  const video =
    typeof document !== "undefined"
      ? document.createElement("video")
      : ({} as HTMLVideoElement);
  if ("muted" in video) {
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
  }
  const handle: WebcamHandle = {
    nodeId: spec.nodeId,
    kind: "webcam",
    deviceId: spec.deviceId,
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
      } catch {
        // ignore — play attempt failed
      }
    }
    handle.ready = true;
  } catch (e) {
    handle.error = String(e);
  }
}

function updateWebcam(gl: WebGL2RenderingContext, h: WebcamHandle) {
  if (h.disposed || !h.ready) return;
  const v = h.video;
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
