/**
 * Spec and handle shapes shared by the external-source registry and the
 * per-source modules (webcam / video / audio). Leaf module — imports nothing
 * from the registry so the per-source modules can depend on it without a
 * cycle.
 */

export interface WebcamExternalSpec {
  nodeId: string;
  kind: "webcam";
  deviceId?: string;
}

export interface VideoExternalSpec {
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

export interface AudioExternalSpec {
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

export interface WebcamHandle {
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
  /** `DOMException.name` when `error` came from a rejected getUserMedia
   *  call, so getExternalStatus can tell a permission denial apart from any
   *  other failure. Null for non-DOMException errors (e.g. "MediaDevices is
   *  unavailable"). */
  errorName: string | null;
  disposed: boolean;
}

export interface VideoHandle {
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

export interface AudioHandle {
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
  /** Same DOMException-name capture as WebcamHandle, mic mode only — file
   *  mode's decode/resolver errors are never DOMExceptions and leave this
   *  null. */
  errorName: string | null;
  disposed: boolean;
}

export type ExternalHandle = WebcamHandle | VideoHandle | AudioHandle;
