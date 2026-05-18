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
  const url = URL.createObjectURL(file);
  try {
    const meta = await probeMetadata(url);
    const handle: VideoAssetHandle = {
      id: cryptoRandomId(),
      name: file.name,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      mimeType: file.type || "video/mp4",
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
    video.preload = "metadata";
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
      } catch {
        // ignore
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
        cleanup();
        reject(new Error("failed to decode video metadata"));
      },
      { once: true },
    );
    video.src = url;
  });
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
