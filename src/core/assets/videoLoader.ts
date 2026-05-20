import { log, normalizeError } from "../../utils/log";
import type { VideoAssetHandle } from "./types";

/**
 * Probe metadata (width/height/duration) from a video Blob by mounting a
 * detached <video> element off-DOM. Resolves once metadata is loaded; rejects
 * after a hard timeout so a malformed file does not hang the import flow.
 */
export async function loadVideoFromFile(file: File): Promise<{
  handle: VideoAssetHandle;
  blob: Blob;
}> {
  // Some drag-and-drop / file-picker paths hand us a File with an empty .type.
  // URL.createObjectURL then yields a typeless Blob URL and Chrome's <video>
  // element fails the load with MEDIA_ERR_SRC_NOT_SUPPORTED. Force a MIME so
  // the element can pick a demuxer.
  const mime = file.type || guessMimeFromName(file.name) || "video/mp4";
  const probeBlob: Blob =
    file.type === mime ? file : new Blob([file], { type: mime });
  const url = URL.createObjectURL(probeBlob);
  try {
    const meta = await probeMetadata(url);
    const handle: VideoAssetHandle = {
      id: cryptoRandomId(),
      name: file.name,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      mimeType: mime,
    };
    return { handle, blob: file };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function probeMetadata(
  url: string,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      resolve({ width: 0, height: 0, duration: 0 });
      return;
    }
    const video = document.createElement("video");
    // "auto" lets the demuxer scan past moov boxes that sit at the end of the
    // file (common with MP4s muxed without -movflags +faststart). "metadata"
    // alone caused intermittent decode failures on otherwise valid files.
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("video metadata probe timed out"));
    }, 8000);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeAttribute("src");
      try {
        video.load();
      } catch (e) {
        log.debug(
          "assets",
          "video probe cleanup load() failed",
          normalizeError(e),
        );
      }
    };
    video.addEventListener(
      "loadedmetadata",
      () => {
        const out = {
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          duration: Number.isFinite(video.duration) ? video.duration : 0,
        };
        cleanup();
        resolve(out);
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        const detail = formatMediaError(video.error);
        cleanup();
        log.warn("assets", "video metadata probe failed", detail);
        reject(new Error(`failed to decode video metadata (${detail})`));
      },
      { once: true },
    );
    video.src = url;
  });
}

function formatMediaError(err: MediaError | null): string {
  if (!err) return "unknown";
  const codeName = MEDIA_ERROR_NAMES[err.code] ?? `code=${err.code}`;
  const msg = err.message?.trim();
  return msg ? `${codeName}: ${msg}` : codeName;
}

const MEDIA_ERROR_NAMES: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED",
  2: "MEDIA_ERR_NETWORK",
  3: "MEDIA_ERR_DECODE",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
};

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
};

function guessMimeFromName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? null;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
