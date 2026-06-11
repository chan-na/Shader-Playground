/**
 * GIF encode worker (Phase 32).
 *
 * Runs the pure `encodeGif` assembler (quantize + LZW + GIF89a) off the main
 * thread so a multi-second recording no longer freezes the editor while it
 * compresses. The worker holds no state — it is a stateless data-in / bytes-out
 * function wrapped in the standard reqId RPC (mirrors glslValidator.worker.ts).
 *
 * Protocol:
 *   in : { type:'encode', reqId, width, height, frames, maxColors, loop,
 *          dither?, localPalette? }
 *   out: { type:'progress', reqId, done, total } (one per assembled frame)
 *        then { type:'encode', reqId, ok:true, bytes }
 *        | { type:'encode', reqId, ok:false, error }
 *
 * The encoded byte buffer is transferred back (zero-copy). Inputs are *not*
 * transferred — the client keeps them so it can fall back to an inline encode
 * if the worker ever dies mid-flight.
 */

// Worker globals (avoid pulling the full DOM "Window" lib into the file).
declare const self: {
  postMessage(data: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

import { encodeGif } from "./encode";
import { mapToPaletteDithered } from "./quantize";

export interface GifEncodeFrameData {
  /** Tightly packed RGBA, `width * height * 4` bytes. */
  rgba: Uint8Array;
  /** Display duration of this frame in milliseconds. */
  delayMs: number;
}

export interface GifEncodeRequest {
  type: "encode";
  reqId: number;
  width: number;
  height: number;
  frames: GifEncodeFrameData[];
  maxColors: number;
  loop: boolean;
  dither?: boolean;
  localPalette?: boolean;
}

export interface GifEncodeResponse {
  type: "encode";
  reqId: number;
  ok: boolean;
  bytes?: Uint8Array;
  error?: string;
}

export interface GifEncodeProgress {
  type: "progress";
  reqId: number;
  done: number;
  total: number;
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data as GifEncodeRequest | undefined;
  if (!m || m.type !== "encode" || typeof m.reqId !== "number") return;

  try {
    // The worker is the only consumer that imports the dithering mapper, so the
    // (heavier) Floyd–Steinberg pass stays in this chunk and never reaches the
    // main bundle.
    const bytes = encodeGif(
      {
        width: m.width,
        height: m.height,
        frames: m.frames,
        maxColors: m.maxColors,
        loop: m.loop,
        localPalette: m.localPalette ?? false,
      },
      m.dither ? mapToPaletteDithered : undefined,
      (done, total) => {
        const p: GifEncodeProgress = {
          type: "progress",
          reqId: m.reqId,
          done,
          total,
        };
        self.postMessage(p);
      },
    );
    const res: GifEncodeResponse = {
      type: "encode",
      reqId: m.reqId,
      ok: true,
      bytes,
    };
    self.postMessage(res, [bytes.buffer as ArrayBuffer]);
  } catch (err) {
    const res: GifEncodeResponse = {
      type: "encode",
      reqId: m.reqId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(res);
  }
};
