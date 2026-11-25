/**
 * Injected platform hooks for the external sources: getUserMedia, the asset
 * blob resolvers, and the AudioContext factory. Kept as registered hooks
 * rather than direct imports so the external-source modules stay free of
 * state-store dependencies and tests can stub the browser media APIs. Leaf
 * module — the per-source modules read from here, never the other way round.
 */

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

export function resolveGetUserMedia(): GetUserMedia | null {
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

export function getVideoBlobResolver(): VideoBlobResolver | null {
  return _videoBlobResolver;
}

/** Same shape as the video resolver but for audio files. */
type AudioBlobResolver = (assetId: string) => Blob | null;
let _audioBlobResolver: AudioBlobResolver | null = null;
export function setAudioBlobResolver(fn: AudioBlobResolver | null) {
  _audioBlobResolver = fn;
}

export function getAudioBlobResolver(): AudioBlobResolver | null {
  return _audioBlobResolver;
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

export function resolveAudioContextFactory(): AudioContextFactory | null {
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
