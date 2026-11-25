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
 *   - `retryExternalSource(nodeId)` disposes and re-acquires a handle in
 *     place (same spec) — the "Enable camera"/"Enable microphone" retry
 *     action after a permission denial, so it re-issues getUserMedia without
 *     waiting for the next graph recompile.
 *   - `disposeAllExternal(gl)` is called on viewport unmount.
 *
 * Per-source acquire/update/release code lives in `webcam.ts`, `video.ts`
 * and `audio.ts`; this module owns the handle map and dispatches by kind.
 * Shared shapes are in `types.ts`, injected platform hooks in `resolvers.ts`.
 *
 * Handles do NOT live inside ExecutionPlan, because plan.dispose() runs on
 * every recompile and would otherwise nuke the camera every time the user
 * edits a shader.
 */

import {
  acquireAudio,
  applyAudioSpec,
  releaseAudio,
  updateAudio,
} from "./audio";
import type { ExternalHandle, ExternalSpec } from "./types";
import {
  acquireVideo,
  applyVideoSpec,
  releaseVideo,
  updateVideo,
} from "./video";
import { acquireWebcam, releaseWebcam, updateWebcam } from "./webcam";

/** getUserMedia rejection names that mean "the user (or the browser policy)
 *  refused the permission prompt", as opposed to any other acquisition
 *  failure (no device, context lost, etc.). */
const DENIED_ERROR_NAMES = new Set([
  "NotAllowedError",
  "SecurityError",
  "PermissionDeniedError",
]);

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

export type ExternalStatusKind = "pending" | "ready" | "denied" | "error";

export interface ExternalStatus {
  ready: boolean;
  error: string | null;
  width: number;
  height: number;
  statusKind: ExternalStatusKind;
}

export function getExternalStatus(nodeId: string): ExternalStatus | null {
  const h = handles.get(nodeId);
  if (!h) return null;
  // VideoHandle has no errorName field (its errors are never permission
  // related), so it's treated the same as "no name captured".
  const errorName = h.kind === "video" ? null : h.errorName;
  const statusKind: ExternalStatusKind = h.ready
    ? "ready"
    : h.error !== null
      ? errorName !== null && DENIED_ERROR_NAMES.has(errorName)
        ? "denied"
        : "error"
      : "pending";
  return {
    ready: h.ready,
    error: h.error,
    width: h.width,
    height: h.height,
    statusKind,
  };
}

/**
 * Re-acquire a handle in place — disposes the current handle (releasing its
 * stream/context/texture) and immediately starts a fresh acquisition with
 * the same spec. Used by the "Enable camera"/"Enable microphone" retry
 * action after a permission denial. No-op for unknown node IDs (e.g. the
 * node was removed from the graph before the user clicked retry).
 */
export function retryExternalSource(nodeId: string): void {
  const h = handles.get(nodeId);
  if (!h) return;
  disposeHandle(h, lastRenderGl ?? undefined);
  handles.set(nodeId, acquire(h.spec));
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

/**
 * Drop every live handle's cached GL texture reference after a WebGL context
 * loss. The textures themselves died with the context, so there is nothing to
 * delete — this only clears the stale JS handles. Without it `uploadFrame`
 * keeps taking the `texSubImage2D` fast path against a dead texture and the
 * source appears permanently frozen once the context is restored; nulling the
 * reference forces the next tick back through `createTexture`. (#13)
 *
 * Deliberately does NOT take a `gl` and does NOT call `deleteTexture`: the
 * objects are already gone, and the media sources (stream / video element /
 * AudioContext) survive the loss untouched. `width`/`height`/`ready` are left
 * alone for the same reason — the source is still ready and still the same
 * size; the re-upload path re-checks both anyway.
 */
export function resetExternalTextures(): void {
  for (const h of handles.values()) {
    h.glTexture = null;
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
    releaseWebcam(h);
  } else if (h.kind === "video") {
    releaseVideo(h);
  } else {
    releaseAudio(h);
  }
  if (h.glTexture && gl) {
    gl.deleteTexture(h.glTexture);
  }
  h.glTexture = null;
  handles.delete(h.nodeId);
}
