import { create } from "zustand";
import type { GifFrame } from "../core/gif/encode";
import { gifEncoder } from "../core/gif/gifEncoderClient";
import { log, normalizeError } from "../utils/log";
import { toast } from "./toastStore";

type GifRecorderStatus = "idle" | "recording" | "encoding";

export interface GifRecorderOptions {
  /** Frames captured per second. */
  fps: number;
  /** Hard cap on recording length; capture stops accepting frames after this. */
  maxSeconds: number;
  /** Longest output edge in pixels; frames are downscaled to fit. */
  maxLongEdge: number;
  /** Palette ceiling (2..256). */
  maxColors: number;
  /** Floyd–Steinberg dithering to soften palette banding (Phase 33). */
  dither: boolean;
  /** Per-frame local palette instead of one shared global table (Phase 33). */
  localPalette: boolean;
}

const GIF_DEFAULTS: GifRecorderOptions = {
  fps: 12,
  maxSeconds: 10,
  maxLongEdge: 480,
  maxColors: 256,
  // Quality-first defaults: dithering + per-frame palettes greatly improve the
  // gradients typical of shader output, and the encode runs in a worker.
  dither: true,
  localPalette: true,
};

export interface GifRecorderState {
  status: GifRecorderStatus;
  startedAt: number | null;
  elapsedMs: number;
  frameCount: number;
  lastBlobUrl: string | null;
  error: string | null;

  start: (options?: Partial<GifRecorderOptions>) => void;
  /** Capture the current canvas frame (throttled to the target fps). */
  captureFrame: (canvas: HTMLCanvasElement) => void;
  stop: () => Promise<Blob | null>;
  tick: () => void;
  clearLast: () => void;
}

interface CapturedFrame {
  rgba: Uint8Array;
  /** Capture timestamp (performance.now()) for inter-frame delay. */
  at: number;
}

interface ActiveGif {
  frames: CapturedFrame[];
  scratch: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  frameIntervalMs: number;
  maxFrames: number;
  maxColors: number;
  maxLongEdge: number;
  dither: boolean;
  localPalette: boolean;
  startAt: number;
  lastCaptureAt: number;
}

let _active: ActiveGif | null = null;

/**
 * Per-frame display durations (ms) from capture timestamps. Each frame shows
 * until the next was captured; the final frame falls back to the nominal
 * interval. Exported for unit testing.
 */
export function frameDelays(
  timestamps: ReadonlyArray<number>,
  fallbackMs: number,
): number[] {
  const delays: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (i < timestamps.length - 1) {
      const a = timestamps[i] ?? 0;
      const b = timestamps[i + 1] ?? 0;
      delays.push(Math.max(0, b - a));
    } else {
      delays.push(fallbackMs);
    }
  }
  return delays;
}

/** Downscaled target dimensions preserving aspect, longest edge ≤ maxLongEdge. */
function fitDimensions(
  srcW: number,
  srcH: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longest = Math.max(srcW, srcH);
  if (longest <= maxLongEdge) {
    return { width: Math.max(1, srcW), height: Math.max(1, srcH) };
  }
  const scale = maxLongEdge / longest;
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

export const useGifRecorderStore = create<GifRecorderState>((set, get) => ({
  status: "idle",
  startedAt: null,
  elapsedMs: 0,
  frameCount: 0,
  lastBlobUrl: null,
  error: null,

  start: (options) => {
    if (_active) return;
    const opts: GifRecorderOptions = { ...GIF_DEFAULTS, ...options };
    const scratch = document.createElement("canvas");
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      const msg = "2D canvas context is unavailable";
      set({ error: msg });
      toast.error(`GIF 녹화 시작 실패: ${msg}`);
      return;
    }
    _active = {
      frames: [],
      scratch,
      ctx,
      width: 0,
      height: 0,
      frameIntervalMs: 1000 / Math.max(1, opts.fps),
      maxFrames: Math.max(1, Math.ceil(opts.fps * opts.maxSeconds)),
      maxColors: opts.maxColors,
      maxLongEdge: opts.maxLongEdge,
      dither: opts.dither,
      localPalette: opts.localPalette,
      startAt: performance.now(),
      lastCaptureAt: -Infinity,
    };
    set({
      status: "recording",
      startedAt: _active.startAt,
      elapsedMs: 0,
      frameCount: 0,
      error: null,
    });
  },

  captureFrame: (canvas) => {
    const active = _active;
    if (!active) return;
    if (active.frames.length >= active.maxFrames) return;
    const now = performance.now();
    if (now - active.lastCaptureAt < active.frameIntervalMs) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    // Lock the output size to the first captured frame's aspect ratio.
    if (active.width === 0) {
      const dims = fitDimensions(
        canvas.width,
        canvas.height,
        active.maxLongEdge,
      );
      active.width = dims.width;
      active.height = dims.height;
      active.scratch.width = dims.width;
      active.scratch.height = dims.height;
    }

    try {
      active.ctx.drawImage(canvas, 0, 0, active.width, active.height);
      const image = active.ctx.getImageData(0, 0, active.width, active.height);
      active.frames.push({ rgba: new Uint8Array(image.data), at: now });
      active.lastCaptureAt = now;
      set({ frameCount: active.frames.length });
    } catch (e) {
      log.warn("render", "GIF frame capture failed", normalizeError(e));
    }
  },

  stop: async () => {
    const active = _active;
    _active = null;
    if (!active) return null;
    if (active.frames.length === 0) {
      set({ status: "idle", startedAt: null });
      toast.error("GIF 녹화 실패: 캡처된 프레임이 없습니다");
      return null;
    }

    set({ status: "encoding" });

    try {
      const frames: GifFrame[] = active.frames.map((f) => ({
        rgba: f.rgba,
        delayMs: 0,
      }));
      const delays = frameDelays(
        active.frames.map((f) => f.at),
        active.frameIntervalMs,
      );
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        if (frame) frame.delayMs = delays[i] ?? active.frameIntervalMs;
      }
      // Offloaded to a worker so the LZW/quantize pass doesn't freeze the UI;
      // falls back to an inline encode if no worker is available (Phase 32).
      const bytes = await gifEncoder().encode({
        width: active.width,
        height: active.height,
        frames,
        maxColors: active.maxColors,
        loop: true,
        dither: active.dither,
        localPalette: active.localPalette,
      });
      const blob = new Blob([bytes], { type: "image/gif" });
      const prev = get().lastBlobUrl;
      if (prev) URL.revokeObjectURL(prev);
      const url = URL.createObjectURL(blob);
      set({ status: "idle", startedAt: null, lastBlobUrl: url });
      return blob;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("render", "GIF encode failed", normalizeError(e));
      set({ status: "idle", startedAt: null, error: msg });
      toast.error(`GIF 인코딩 실패: ${msg}`);
      return null;
    }
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
