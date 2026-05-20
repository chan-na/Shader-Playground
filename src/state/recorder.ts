import { create } from "zustand";
import { log, normalizeError } from "../utils/log";
import { toast } from "./toastStore";

type RecorderStatus = "idle" | "recording";

export interface RecorderState {
  status: RecorderStatus;
  startedAt: number | null;
  /** Wall-clock ms elapsed in the current recording (updated by the RAF tick). */
  elapsedMs: number;
  lastBlobUrl: string | null;
  error: string | null;

  start: (canvas: HTMLCanvasElement, fps?: number) => Promise<void>;
  stop: () => Promise<Blob | null>;
  tick: () => void;
  clearLast: () => void;
}

interface InternalRecorder {
  recorder: MediaRecorder;
  chunks: Blob[];
  startAt: number;
  mimeType: string;
}

let _active: InternalRecorder | null = null;

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
  elapsedMs: 0,
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
      };
      set({
        status: "recording",
        startedAt: _active.startAt,
        elapsedMs: 0,
        error: null,
      });
    } catch (err) {
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
      active.recorder.onstop = () => {
        const blob = new Blob(active.chunks, { type: active.mimeType });
        // Free previous URL if any.
        const prev = get().lastBlobUrl;
        if (prev) URL.revokeObjectURL(prev);
        const url = URL.createObjectURL(blob);
        set({ status: "idle", startedAt: null, lastBlobUrl: url });
        resolve(blob);
      };
      try {
        active.recorder.stop();
      } catch {
        set({ status: "idle", startedAt: null });
        resolve(null);
      }
    });
  },
  tick: () => {
    if (!_active) return;
    set({ elapsedMs: performance.now() - _active.startAt });
  },
  clearLast: () => {
    const prev = get().lastBlobUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ lastBlobUrl: null });
  },
}));
