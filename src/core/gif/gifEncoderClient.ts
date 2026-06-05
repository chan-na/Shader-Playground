/**
 * Main-thread client for the GIF encode worker (Phase 32).
 *
 * One worker per app, created lazily on the first `encode()`. Each call returns
 * a Promise that resolves with the assembled GIF89a bytes. Mirrors the
 * glslValidator client, but with a stronger failure model: where the validator
 * resolves `[]` on failure (live diagnostics are optional), a GIF the user
 * explicitly recorded must never be lost — so every failure path falls back to
 * an **inline synchronous encode** on the main thread. Worst case is therefore
 * a brief freeze plus a non-dithered GIF (the inline path ships the default
 * mapper so the Floyd–Steinberg pass stays in the worker chunk); the common
 * case offloads encoding and keeps dithering.
 *
 * Inputs are deliberately *not* transferred into the worker, so the captured
 * frame buffers stay intact on the main thread and remain available for the
 * inline fallback even if the worker dies after we posted to it.
 */

import { log, normalizeError } from "../../utils/log";
import { encodeGif } from "./encode";
import type {
  GifEncodeFrameData,
  GifEncodeRequest,
  GifEncodeResponse,
} from "./gifEncoder.worker";
import GifWorker from "./gifEncoder.worker.ts?worker";

export interface GifEncodeJob {
  width: number;
  height: number;
  frames: GifEncodeFrameData[];
  maxColors: number;
  loop: boolean;
  dither?: boolean;
  localPalette?: boolean;
}

export interface GifEncoderOptions {
  /** Override the worker constructor (test injection). */
  workerFactory?: () => Worker;
}

interface PendingJob {
  resolve: (bytes: Uint8Array) => void;
  reject: (err: Error) => void;
  job: GifEncodeJob;
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function encodeInline(job: GifEncodeJob): Uint8Array {
  // Default mapper (no dithering) on purpose — keeps mapToPaletteDithered out of
  // the main bundle. The fallback still produces a valid, complete GIF.
  return encodeGif({
    width: job.width,
    height: job.height,
    frames: job.frames,
    maxColors: job.maxColors,
    loop: job.loop,
    localPalette: job.localPalette ?? false,
  });
}

export class GifEncoderClient {
  private worker: Worker | null = null;
  private nextReqId = 0;
  private pending = new Map<number, PendingJob>();
  private failed = false;
  private readonly workerFactory: () => Worker;
  private readonly usingDefaultFactory: boolean;

  constructor(opts: GifEncoderOptions = {}) {
    this.usingDefaultFactory = !opts.workerFactory;
    this.workerFactory = opts.workerFactory ?? (() => new GifWorker());
  }

  /**
   * Encode `job` to GIF89a bytes. Resolves with the worker result, or with an
   * inline encode if no worker is available / the worker fails. Only rejects if
   * the encode itself is invalid (the same input would throw synchronously too).
   */
  encode(job: GifEncodeJob): Promise<Uint8Array> {
    const w = this.ensureWorker();
    if (!w) return this.inline(job);

    const reqId = ++this.nextReqId;
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject, job });
      const msg: GifEncodeRequest = {
        type: "encode",
        reqId,
        width: job.width,
        height: job.height,
        frames: job.frames,
        maxColors: job.maxColors,
        loop: job.loop,
        dither: job.dither ?? false,
        localPalette: job.localPalette ?? false,
      };
      try {
        w.postMessage(msg);
      } catch (e) {
        this.pending.delete(reqId);
        log.warn(
          "render",
          "gifEncoder postMessage failed; encoding inline",
          normalizeError(e),
        );
        this.inline(job).then(resolve, reject);
      }
    });
  }

  /** Terminate the worker and reject any in-flight jobs. */
  dispose(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {
        log.debug("render", "gifEncoder terminate failed", normalizeError(e));
      }
      this.worker = null;
    }
    for (const p of this.pending.values()) {
      p.reject(new Error("gifEncoder disposed"));
    }
    this.pending.clear();
    // Allow a fresh worker if encode() is called again.
    this.failed = false;
  }

  private inline(job: GifEncodeJob): Promise<Uint8Array> {
    try {
      return Promise.resolve(encodeInline(job));
    } catch (e) {
      return Promise.reject(asError(e));
    }
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (this.failed) return null;
    // jsdom / non-worker environments: skip straight to the inline path so
    // tests and SSR stay deterministic instead of constructing a dead worker.
    if (this.usingDefaultFactory && typeof Worker === "undefined") {
      this.failed = true;
      return null;
    }
    let w: Worker;
    try {
      w = this.workerFactory();
    } catch (e) {
      this.failed = true;
      log.warn(
        "render",
        "gifEncoder worker construct failed; encoding inline",
        normalizeError(e),
      );
      return null;
    }
    w.addEventListener("message", (ev: MessageEvent) => this.onMessage(ev));
    w.addEventListener("error", (ev) => this.onError(ev));
    this.worker = w;
    return w;
  }

  private onMessage(ev: MessageEvent): void {
    const d = ev.data as GifEncodeResponse | undefined;
    if (!d || d.type !== "encode" || typeof d.reqId !== "number") return;
    const p = this.pending.get(d.reqId);
    if (!p) return;
    this.pending.delete(d.reqId);
    if (d.ok && d.bytes) {
      p.resolve(d.bytes);
    } else {
      // A worker-side encode error would also throw inline, so don't loop —
      // surface it to the caller.
      p.reject(new Error(d.error ?? "gif encode failed in worker"));
    }
  }

  private onError(ev: Event): void {
    this.failed = true;
    log.warn(
      "render",
      "gifEncoder worker error; encoding inline",
      ev instanceof ErrorEvent ? ev.message : "error event",
    );
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignored — we are already in the failure path
      }
      this.worker = null;
    }
    // Inputs were never transferred, so we can still encode pending jobs inline.
    const jobs = [...this.pending.values()];
    this.pending.clear();
    for (const p of jobs) {
      this.inline(p.job).then(p.resolve, p.reject);
    }
  }
}

// Module singleton — gifRecorder.stop() uses this so every recording shares one
// worker (the only per-call state is reqId + pending, trivially shared).
let _singleton: GifEncoderClient | null = null;
export function gifEncoder(): GifEncoderClient {
  if (!_singleton) _singleton = new GifEncoderClient();
  return _singleton;
}
