// biome-ignore-all lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL API, not a React hook
import { log } from "../../utils/log";
import {
  createFramebuffer,
  disposeFramebuffer,
  type Framebuffer,
} from "../gl/framebuffer";
import {
  type CompiledProgram,
  createProgram,
  disposeProgram,
} from "../gl/program";
import { THUMB_SIZE } from "./readback";

/**
 * Async FBO readback using WebGL2 PBO + fenceSync. Per nodeId, at most one
 * request is in flight.
 *
 * The pass's full-resolution color attachment is first downsampled on the GPU
 * into a per-node `THUMB_SIZE²` framebuffer (one textured fullscreen-quad pass,
 * Y-flipped so the result is already top-down). Only that tiny FBO is read back
 * through the PBO, so the transfer is a constant `96×96×4` regardless of the
 * source resolution and there is no CPU box-filter. The GPU copies pixels into
 * the PBO when readPixels runs, and we only stall the CPU when the fence is
 * already signaled (which we poll non-blockingly). N-frame latency is
 * acceptable for thumbnails.
 *
 * Lifecycle:
 *   request(gl, nodeId, fb)   — non-blocking; returns false if a slot is
 *                                already pending for this node (or blit
 *                                resources failed to build).
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

/** Bytes read back per slot — fixed now that the GPU downsamples first. */
const THUMB_BYTES = THUMB_SIZE * THUMB_SIZE * 4;

const BLIT_VS = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Sample with a flipped Y so the thumb FBO stores the image top-down; the
// subsequent readPixels then yields rows in browser (ImageData) order without a
// CPU flip.
const BLIT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = texture(u_src, vec2(v_uv.x, 1.0 - v_uv.y));
}`;

interface BlitResources {
  program: CompiledProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
}

/** Build the shared downsample program + fullscreen-quad VAO, or null on fail. */
function buildBlit(gl: WebGL2RenderingContext): BlitResources | null {
  const { program } = createProgram(gl, BLIT_VS, BLIT_FS);
  if (!program) {
    log.warn("gl", "thumbnail blit program failed to compile");
    return null;
  }
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) {
    disposeProgram(gl, program);
    if (vao) gl.deleteVertexArray(vao);
    if (vbo) gl.deleteBuffer(vbo);
    return null;
  }
  const loc = program.attributes.a_position ?? 0;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return { program, vao, vbo };
}

/** Draw `srcTex` into `thumb` (THUMB_SIZE², Y-flipped) with one quad pass. */
function downsampleInto(
  gl: WebGL2RenderingContext,
  blit: BlitResources,
  thumb: Framebuffer,
  srcTex: WebGLTexture,
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, thumb.fbo);
  gl.viewport(0, 0, THUMB_SIZE, THUMB_SIZE);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(blit.program.program);
  gl.uniform1i(blit.program.uniforms.u_src ?? null, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.bindVertexArray(blit.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}

interface Slot {
  pbo: WebGLBuffer;
  /** Per-node THUMB_SIZE² downsample target. */
  thumb: Framebuffer;
  sync: WebGLSync | null;
  pending: boolean;
  /** perf.now() when request() fired — for stalled-fence diagnostics. */
  requestedAt: number;
}

export class AsyncThumbnailReadback {
  private slots = new Map<string, Slot>();
  private blit: BlitResources | null = null;

  /** True if `request` was issued (slot was idle). */
  request(
    gl: WebGL2RenderingContext,
    nodeId: string,
    fb: Framebuffer,
  ): boolean {
    if (!this.blit) this.blit = buildBlit(gl);
    const blit = this.blit;
    if (!blit) return false;
    let slot = this.slots.get(nodeId);
    if (slot?.pending) return false;
    if (!slot) {
      const pbo = gl.createBuffer();
      if (!pbo) return false;
      let thumb: Framebuffer;
      try {
        thumb = createFramebuffer(gl, THUMB_SIZE, THUMB_SIZE, false);
      } catch {
        gl.deleteBuffer(pbo);
        return false;
      }
      // PBO storage is fixed — the readback target is always THUMB_SIZE².
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, THUMB_BYTES, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      slot = { pbo, thumb, sync: null, pending: false, requestedAt: 0 };
      this.slots.set(nodeId, slot);
    }

    // GPU downsample: draw the source color texture into the small thumb FBO.
    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevVp = gl.getParameter(gl.VIEWPORT);
    downsampleInto(gl, blit, slot.thumb, fb.color.texture);

    // readPixels with PIXEL_PACK_BUFFER bound writes into the buffer rather than
    // a CPU array. The thumb FBO is still bound as the read framebuffer.
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    gl.readPixels(0, 0, THUMB_SIZE, THUMB_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // Restore the caller's framebuffer + viewport.
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
    if (prevVp) gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]);

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
      if (status === gl.TIMEOUT_EXPIRED) continue;
      if (status === gl.WAIT_FAILED) {
        // WAIT_FAILED is terminal (e.g. context loss), not a transient timeout.
        // Drop the fence and clear pending so a fresh request can be issued —
        // otherwise the slot stays pinned as pending forever and request()
        // returns false for this node for the rest of the session.
        gl.deleteSync(slot.sync);
        slot.sync = null;
        slot.pending = false;
        continue;
      }
      // Either ALREADY_SIGNALED or CONDITION_SATISFIED — safe to fetch.
      gl.deleteSync(slot.sync);
      slot.sync = null;
      slot.pending = false;
      // The thumb FBO is already top-down and THUMB_SIZE², so the readback
      // buffer maps straight onto an ImageData with no further processing.
      const buf = new Uint8ClampedArray(THUMB_BYTES);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      out.push({ nodeId, image: new ImageData(buf, THUMB_SIZE, THUMB_SIZE) });
    }
    return out;
  }

  release(gl: WebGL2RenderingContext, nodeId: string): void {
    const slot = this.slots.get(nodeId);
    if (!slot) return;
    if (slot.sync) gl.deleteSync(slot.sync);
    gl.deleteBuffer(slot.pbo);
    disposeFramebuffer(gl, slot.thumb);
    this.slots.delete(nodeId);
  }

  disposeAll(gl: WebGL2RenderingContext): void {
    for (const [nodeId] of this.slots) this.release(gl, nodeId);
    if (this.blit) {
      gl.deleteVertexArray(this.blit.vao);
      gl.deleteBuffer(this.blit.vbo);
      disposeProgram(gl, this.blit.program);
      this.blit = null;
    }
  }

  /** Returns the IDs currently in flight — for diagnostics / tests. */
  pendingNodeIds(): string[] {
    return Array.from(this.slots.entries())
      .filter(([, s]) => s.pending)
      .map(([id]) => id);
  }
}
