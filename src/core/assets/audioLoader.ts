import type { AudioAssetHandle } from "./types";

/**
 * Probe duration / sampleRate / channels from an audio Blob by decoding it
 * with a temporary AudioContext. The decoded AudioBuffer is discarded —
 * playback rebuilds it from the persisted Blob, so we don't keep the
 * decoded data around (mp3 → PCM expands ~10x in memory).
 */
export async function loadAudioFromFile(file: File): Promise<{
  handle: AudioAssetHandle;
  blob: Blob;
}> {
  const meta = await probeMetadata(file);
  const handle: AudioAssetHandle = {
    id: cryptoRandomId(),
    name: file.name,
    duration: meta.duration,
    sampleRate: meta.sampleRate,
    channels: meta.channels,
    mimeType: file.type || "audio/mpeg",
  };
  return { handle, blob: file };
}

async function probeMetadata(
  file: File,
): Promise<{ duration: number; sampleRate: number; channels: number }> {
  const empty = { duration: 0, sampleRate: 0, channels: 0 };
  if (typeof window === "undefined") return empty;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return empty;
  let ctx: AudioContext | null = null;
  try {
    ctx = new Ctor();
    const buf = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    return {
      duration: Number.isFinite(decoded.duration) ? decoded.duration : 0,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
    };
  } catch {
    return empty;
  } finally {
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        // ignore
      }
    }
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
