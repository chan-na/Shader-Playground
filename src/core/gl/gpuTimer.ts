/**
 * Per-pass GPU timing via `EXT_disjoint_timer_query_webgl2`. Mirrors the
 * lifecycle shape of `AsyncThumbnailReadback` — issue, poll, release — so the
 * RAF loop can wire it the same way.
 *
 * Notes on the extension:
 *   - Only one `TIME_ELAPSED_EXT` query may be active at a time, so passes are
 *     measured sequentially (begin → draw → end → next begin → …).
 *   - Results trail by N frames; `poll()` is non-blocking.
 *   - `GPU_DISJOINT_EXT` invalidates every in-flight query — the spec'd reset
 *     is to discard them all and start over.
 *   - Privacy mitigations reduce timer precision (typically 1 µs on Chrome).
 *     Useful for relative comparisons across passes, not for sub-µs accuracy.
 *
 * The extension is currently exposed on Chrome/Edge. Firefox gates it behind a
 * pref; Safari/SwiftShader do not expose it. `create()` returns null on those
 * environments so the rest of the app can no-op gracefully.
 */

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface PendingQuery {
  nodeId: string;
  query: WebGLQuery;
}

export interface GpuTimerSample {
  nodeId: string;
  /** GPU time spent in this pass, in milliseconds. */
  ms: number;
}

export class GpuTimerPool {
  private ext: TimerExt;
  /** Currently active begin/end pair, awaiting `end()`. */
  private active: PendingQuery | null = null;
  /** Queries already submitted (between end and poll completion). */
  private pending: PendingQuery[] = [];
  /** Idle WebGLQuery objects available for reuse. */
  private idle: WebGLQuery[] = [];

  private constructor(ext: TimerExt) {
    this.ext = ext;
  }

  /**
   * Returns a pool when the extension is exposed, or null when it is not.
   * The null path lets callers wire `pool?.begin(...)` no-ops with zero cost.
   */
  static create(gl: WebGL2RenderingContext): GpuTimerPool | null {
    const ext = gl.getExtension(
      "EXT_disjoint_timer_query_webgl2",
    ) as TimerExt | null;
    if (!ext) return null;
    return new GpuTimerPool(ext);
  }

  /**
   * Open a TIME_ELAPSED query around the next draw. Silently no-ops if a
   * begin is already active without a matching end — callers shouldn't nest,
   * but we'd rather lose one sample than corrupt later frames.
   */
  begin(gl: WebGL2RenderingContext, nodeId: string): void {
    if (this.active) return;
    const query = this.idle.pop() ?? gl.createQuery();
    if (!query) return;
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = { nodeId, query };
  }

  end(gl: WebGL2RenderingContext): void {
    if (!this.active) return;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /**
   * Drain queries whose results are available. If GPU_DISJOINT_EXT fired, the
   * extension spec says all in-flight queries are invalid — we discard them
   * (recycling the WebGLQuery objects) and emit nothing for that frame.
   */
  poll(gl: WebGL2RenderingContext): GpuTimerSample[] {
    if (this.pending.length === 0) return [];

    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
    if (disjoint) {
      for (const p of this.pending) this.idle.push(p.query);
      this.pending = [];
      return [];
    }

    const samples: GpuTimerSample[] = [];
    const stillPending: PendingQuery[] = [];
    for (const p of this.pending) {
      const available = gl.getQueryParameter(
        p.query,
        gl.QUERY_RESULT_AVAILABLE,
      ) as boolean;
      if (!available) {
        stillPending.push(p);
        continue;
      }
      const ns = gl.getQueryParameter(p.query, gl.QUERY_RESULT) as number;
      samples.push({ nodeId: p.nodeId, ms: ns / 1_000_000 });
      this.idle.push(p.query);
    }
    this.pending = stillPending;
    return samples;
  }

  /**
   * Drop pending samples and free queries for a node ID (called when a pass
   * disappears from the plan). In-flight queries for the node are discarded
   * — their result would refer to deleted GL state on completion.
   */
  release(gl: WebGL2RenderingContext, nodeId: string): void {
    if (this.active?.nodeId === nodeId) {
      // The query is mid-begin; ending it lets us recycle the handle without
      // leaking a dangling query slot on the GL side.
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.idle.push(this.active.query);
      this.active = null;
    }
    this.pending = this.pending.filter((p) => {
      if (p.nodeId !== nodeId) return true;
      this.idle.push(p.query);
      return false;
    });
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.active) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      gl.deleteQuery(this.active.query);
      this.active = null;
    }
    for (const p of this.pending) gl.deleteQuery(p.query);
    for (const q of this.idle) gl.deleteQuery(q);
    this.pending = [];
    this.idle = [];
  }

  /** Test affordance — surface internal queue depth without leaking internals. */
  pendingCount(): number {
    return this.pending.length;
  }
}
