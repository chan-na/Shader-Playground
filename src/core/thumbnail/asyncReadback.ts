import type { Framebuffer } from "../gl/framebuffer";
import { downsampleToThumb, THUMB_SIZE } from "./readback";

/**
 * Async FBO readback using WebGL2 PBO + fenceSync. Per nodeId, at most one
 * request is in flight. The GPU copies pixels into the PBO when readPixels
 * runs, and we only stall the CPU when the fence is already signaled (which
 * we poll non-blockingly). N-frame latency is acceptable for thumbnails.
 *
 * Lifecycle:
 *   request(gl, nodeId, fb)   — non-blocking; returns false if a slot is
 *                                already pending for this node.
 *   poll(gl)                   — drains slots whose fences have signaled,
 *                                producing { nodeId, image } entries.
 *   release(gl, nodeId)        — free resources for a node (e.g., when the
 *                                pass is recompiled away).
 *   disposeAll(gl)             — free everything (context teardown).
 */
export interface AsyncReadbackResult {
  nodeId: string;
  image: ImageData;
}

interface Slot {
  pbo: WebGLBuffer;
  sync: WebGLSync | null;
  /** FBO dims captured at request time so a mid-flight resize doesn't lie. */
  width: number;
  height: number;
  pending: boolean;
  /** perf.now() when request() fired — for stalled-fence diagnostics. */
  requestedAt: number;
}

export class AsyncThumbnailReadback {
  private slots = new Map<string, Slot>();

  /** True if `request` was issued (slot was idle). */
  request(
    gl: WebGL2RenderingContext,
    nodeId: string,
    fb: Framebuffer,
  ): boolean {
    let slot = this.slots.get(nodeId);
    if (slot?.pending) return false;
    if (!slot) {
      const pbo = gl.createBuffer();
      if (!pbo) return false;
      slot = {
        pbo,
        sync: null,
        width: 0,
        height: 0,
        pending: false,
        requestedAt: 0,
      };
      this.slots.set(nodeId, slot);
    }
    const w = fb.width;
    const h = fb.height;
    // Reserve the PBO storage if dimensions changed (or first use).
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    if (slot.width !== w || slot.height !== h) {
      gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
      slot.width = w;
      slot.height = h;
    }
    const prevFB = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.fbo);
    // readPixels with PIXEL_PACK_BUFFER bound writes into the buffer at the
    // given offset rather than into a CPU array.
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevFB);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    // Place a fence so we can poll completion without stalling.
    if (slot.sync) gl.deleteSync(slot.sync);
    slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    slot.pending = true;
    slot.requestedAt =
      typeof performance !== "undefined" ? performance.now() : 0;
    return true;
  }

  /**
   * Returns all node results whose fences are signaled. Slots that are still
   * busy remain pending; ones that take longer than a few frames simply stay
   * in flight without ever blocking the main thread.
   */
  poll(gl: WebGL2RenderingContext): AsyncReadbackResult[] {
    const out: AsyncReadbackResult[] = [];
    for (const [nodeId, slot] of this.slots) {
      if (!slot.pending || !slot.sync) continue;
      const status = gl.clientWaitSync(slot.sync, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED || status === gl.WAIT_FAILED) continue;
      // Either ALREADY_SIGNALED or CONDITION_SATISFIED — safe to fetch.
      gl.deleteSync(slot.sync);
      slot.sync = null;
      slot.pending = false;
      const buf = new Uint8Array(slot.width * slot.height * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const image = downsampleToThumb(buf, slot.width, slot.height, THUMB_SIZE);
      out.push({ nodeId, image });
    }
    return out;
  }

  release(gl: WebGL2RenderingContext, nodeId: string): void {
    const slot = this.slots.get(nodeId);
    if (!slot) return;
    if (slot.sync) gl.deleteSync(slot.sync);
    gl.deleteBuffer(slot.pbo);
    this.slots.delete(nodeId);
  }

  disposeAll(gl: WebGL2RenderingContext): void {
    for (const [nodeId] of this.slots) this.release(gl, nodeId);
  }

  /** Returns the IDs currently in flight — for diagnostics / tests. */
  pendingNodeIds(): string[] {
    return Array.from(this.slots.entries())
      .filter(([, s]) => s.pending)
      .map(([id]) => id);
  }
}
