/**
 * Main-thread client for the live GLSL validation worker (Phase 24).
 *
 * One worker per app. Lazily created on the first `validate()` so apps that
 * never touch a shader pay nothing. Each `validate()` returns a Promise that
 * resolves with the worker's diagnostics (parsed via the existing
 * `parseShaderInfoLog` so live and authoritative diagnostics share a format).
 *
 * Coalescing is the caller's responsibility — the validator simply tracks
 * pending requests by reqId and resolves each independently. The CodeEditor
 * consumer debounces its calls and discards stale resolutions via the React
 * effect cleanup pattern (see `useLiveValidation`).
 *
 * Failure model:
 *   - Worker construction throws → permanent fail flag, future validate
 *     resolves with [] (no live diagnostics). Authoritative recompile path
 *     is unaffected and remains the source of truth.
 *   - Worker fires `error` event → same: permanent fail, drain pending with
 *     [] so callers don't hang, log via the central logger.
 */

import { log, normalizeError } from "../../utils/log";
import { type GLSLDiagnostic, parseShaderInfoLog } from "../graph/diagnostics";
import type {
  GlslStage,
  GlslValidateRequest,
  GlslValidateResponse,
} from "./glslValidator.worker";
import GlslWorker from "./glslValidator.worker.ts?worker";

export type { GlslStage };

type PendingResolver = (diags: GLSLDiagnostic[]) => void;

export interface ValidatorOptions {
  /** Override the worker constructor (test injection). */
  workerFactory?: () => Worker;
}

export class GlslValidator {
  private worker: Worker | null = null;
  private nextReqId = 0;
  private pending = new Map<number, PendingResolver>();
  private failed = false;
  private readonly workerFactory: () => Worker;

  constructor(opts: ValidatorOptions = {}) {
    this.workerFactory = opts.workerFactory ?? (() => new GlslWorker());
  }

  /**
   * Validate `source` as `stage` and return parsed diagnostics. On any
   * failure (worker not available, post failed, error event), resolves with
   * an empty array — callers treat empty as "no live signal".
   */
  validate(stage: GlslStage, source: string): Promise<GLSLDiagnostic[]> {
    const w = this.ensureWorker();
    if (!w) return Promise.resolve([]);
    const reqId = ++this.nextReqId;
    return new Promise<GLSLDiagnostic[]>((resolve) => {
      this.pending.set(reqId, resolve);
      const msg: GlslValidateRequest = {
        type: "validate",
        reqId,
        stage,
        source,
      };
      try {
        w.postMessage(msg);
      } catch (e) {
        this.pending.delete(reqId);
        log.warn("app", "glslValidator postMessage failed", normalizeError(e));
        resolve([]);
      }
    });
  }

  /** Terminate the worker and resolve outstanding promises with []. */
  dispose(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {
        log.debug("app", "glslValidator terminate failed", normalizeError(e));
      }
      this.worker = null;
    }
    this.drainPending();
    // After dispose, keep failed=false so the validator can be re-used if
    // someone calls validate() again (creates a fresh worker).
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (this.failed) return null;
    let w: Worker;
    try {
      w = this.workerFactory();
    } catch (e) {
      this.failed = true;
      log.warn(
        "app",
        "glslValidator worker construct failed",
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
    const d = ev.data as GlslValidateResponse | undefined;
    if (!d || d.type !== "validate" || typeof d.reqId !== "number") return;
    const resolve = this.pending.get(d.reqId);
    if (!resolve) return;
    this.pending.delete(d.reqId);
    resolve(parseShaderInfoLog(d.log ?? ""));
  }

  private onError(ev: Event): void {
    this.failed = true;
    log.warn(
      "app",
      "glslValidator worker error",
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
    this.drainPending();
  }

  private drainPending(): void {
    for (const resolve of this.pending.values()) resolve([]);
    this.pending.clear();
  }
}

// Module singleton — the CodeEditor uses this so all shader edits share one
// worker (cheaper than per-mount; the validator's only state is reqId+pending
// which is trivially shared).
let _singleton: GlslValidator | null = null;
export function glslValidator(): GlslValidator {
  if (!_singleton) _singleton = new GlslValidator();
  return _singleton;
}
