import { create } from "zustand";
import { log, normalizeError } from "../utils/log";
import { toast } from "./toastStore";

type RecorderStatus = "idle" | "recording";

export interface RecorderState {
  status: RecorderStatus;
  startedAt: number | null;
  lastBlobUrl: string | null;
  error: string | null;

  start: (canvas: HTMLCanvasElement, fps?: number) => Promise<void>;
  stop: () => Promise<Blob | null>;
  clearLast: () => void;
}

interface InternalRecorder {
  recorder: MediaRecorder;
  chunks: Blob[];
  startAt: number;
  mimeType: string;
  /** The captureStream whose tracks must be stopped when recording ends. */
  stream: MediaStream;
}

let _active: InternalRecorder | null = null;

/** Resolve stop() even if MediaRecorder never fires onstop/onerror. */
const STOP_TIMEOUT_MS = 5000;

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function pickMimeType(): string | null {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (e) {
      log.warn(
        "app",
        `MediaRecorder.isTypeSupported threw for ${m}`,
        normalizeError(e),
      );
    }
  }
  return null;
}

export const useRecorderStore = create<RecorderState>((set, get) => ({
  status: "idle",
  startedAt: null,
  lastBlobUrl: null,
  error: null,
  start: async (canvas, fps = 30) => {
    if (_active) return;
    const mime = pickMimeType();
    if (!mime) {
      const msg = "MediaRecorder is not supported in this browser";
      set({ error: msg });
      toast.error(`녹화 시작 실패: ${msg}`);
      return;
    }
    // `captureStream` may be missing on some browsers (Safari requires the
    // experimental flag in older versions).
    const stream =
      typeof canvas.captureStream === "function"
        ? canvas.captureStream(fps)
        : null;
    if (!stream) {
      const msg = "canvas.captureStream() is not supported";
      set({ error: msg });
      toast.error(`녹화 시작 실패: ${msg}`);
      return;
    }
    try {
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      recorder.start(250);
      _active = {
        recorder,
        chunks,
        startAt: performance.now(),
        mimeType: mime,
        stream,
      };
      set({
        status: "recording",
        startedAt: _active.startAt,
        error: null,
      });
    } catch (err) {
      // Construction failed after captureStream opened the tracks — release
      // them so we don't leak a live canvas-capture track on every failure.
      stopTracks(stream);
      const msg = (err as Error).message;
      set({ error: msg });
      toast.error(`녹화 시작 실패: ${msg}`);
    }
  },
  stop: async () => {
    const active = _active;
    _active = null;
    if (!active) return null;
    return new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Always release the capture tracks so the canvas isn't left being
        // recorded after the MediaRecorder has stopped.
        stopTracks(active.stream);
        resolve(blob);
      };
      active.recorder.onstop = () => {
        const blob = new Blob(active.chunks, { type: active.mimeType });
        // Free previous URL if any.
        const prev = get().lastBlobUrl;
        if (prev) URL.revokeObjectURL(prev);
        const url = URL.createObjectURL(blob);
        set({ status: "idle", startedAt: null, lastBlobUrl: url });
        finish(blob);
      };
      active.recorder.onerror = () => {
        set({ status: "idle", startedAt: null });
        finish(null);
      };
      // Safety net: some browsers can fail to fire onstop (e.g. a stream that
      // ended abnormally). Without this the promise would hang forever.
      const timer = setTimeout(() => {
        set({ status: "idle", startedAt: null });
        finish(null);
      }, STOP_TIMEOUT_MS);
      try {
        active.recorder.stop();
      } catch {
        set({ status: "idle", startedAt: null });
        finish(null);
      }
    });
  },
  clearLast: () => {
    const prev = get().lastBlobUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ lastBlobUrl: null });
  },
}));
