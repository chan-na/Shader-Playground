import { describe, expect, it } from "vitest";
import { createFakeGl } from "../gl/fakeGl";
import { AsyncThumbnailReadback } from "./asyncReadback";
import { downsampleToThumb } from "./readback";

/**
 * WebGL2 stub for AsyncThumbnailReadback. The GPU-downsample path (program +
 * VAO + thumb FBO) is satisfied by `createFakeGl`; on top of that we model the
 * PBO data flow and a manually-stepped fence so tests can drain on demand.
 */
function makeGL(opts: { linkFailure?: boolean } = {}) {
  const calls: string[] = [];
  let signaled = false;
  const pboBytes = new Map<WebGLBuffer, Uint8Array>();
  let lastBoundPbo: WebGLBuffer | null = null;

  const base = createFakeGl({
    attributes: ["a_position"],
    uniforms: ["u_src"],
    ...(opts.linkFailure ? { linkFailure: true } : {}),
  }) as unknown as Record<string, unknown>;

  const overrides = {
    // Enum constants the readback path identity-compares.
    PIXEL_PACK_BUFFER: "PIXEL_PACK_BUFFER",
    FRAMEBUFFER_BINDING: "FRAMEBUFFER_BINDING",
    VIEWPORT: "VIEWPORT",
    DEPTH_TEST: "DEPTH_TEST",
    STREAM_READ: "STREAM_READ",
    SYNC_GPU_COMMANDS_COMPLETE: "SYNC_GPU_COMMANDS_COMPLETE",
    TIMEOUT_EXPIRED: 0,
    WAIT_FAILED: -1,
    ALREADY_SIGNALED: 1,
    CONDITION_SATISFIED: 2,

    createBuffer: () => {
      const b = { id: Symbol("buf") } as unknown as WebGLBuffer;
      pboBytes.set(b, new Uint8Array(0));
      return b;
    },
    bindBuffer: (target: string, b: WebGLBuffer | null) => {
      if (target === "PIXEL_PACK_BUFFER") lastBoundPbo = b;
    },
    bufferData: (target: string, sizeOrData: number | ArrayBufferView) => {
      if (target !== "PIXEL_PACK_BUFFER" || !lastBoundPbo) return;
      const size =
        typeof sizeOrData === "number" ? sizeOrData : sizeOrData.byteLength;
      pboBytes.set(lastBoundPbo, new Uint8Array(size));
    },
    getParameter: () => null,
    readPixels: (
      _x: number,
      _y: number,
      w: number,
      h: number,
      _f: string,
      _t: string,
      _offsetOrBuf: number | ArrayBufferView,
    ) => {
      calls.push(`readPixels ${w}x${h}`);
      if (lastBoundPbo) {
        // Fill the bound PBO with a sentinel pattern so tests can recognize it.
        const buf = new Uint8Array(w * h * 4);
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = 128;
          buf[i + 1] = 64;
          buf[i + 2] = 32;
          buf[i + 3] = 255;
        }
        pboBytes.set(lastBoundPbo, buf);
      }
    },
    fenceSync: () => {
      calls.push("fenceSync");
      return { id: Symbol("sync") } as unknown as WebGLSync;
    },
    clientWaitSync: () => {
      calls.push("clientWaitSync");
      return signaled ? 1 : 0; // ALREADY_SIGNALED vs TIMEOUT_EXPIRED
    },
    deleteSync: () => {
      calls.push("deleteSync");
    },
    getBufferSubData: (
      _target: string,
      _offset: number,
      out: ArrayBufferView,
    ) => {
      calls.push("getBufferSubData");
      const src = lastBoundPbo ? pboBytes.get(lastBoundPbo) : undefined;
      if (src && out instanceof Uint8ClampedArray) {
        out.set(src.subarray(0, out.length));
      }
    },
  };

  const gl = { ...base, ...overrides } as unknown as WebGL2RenderingContext;
  return {
    gl,
    calls,
    setSignaled: (v: boolean) => {
      signaled = v;
    },
  };
}

function fakeFB(width: number, height: number) {
  return {
    fbo: {} as WebGLFramebuffer,
    color: { texture: {} as WebGLTexture, width, height },
    width,
    height,
    depth: null,
  } as never;
}

describe("AsyncThumbnailReadback", () => {
  it("downsamples on the GPU so readPixels is always THUMB_SIZE², not the source size", () => {
    const { gl, calls } = makeGL();
    const r = new AsyncThumbnailReadback();
    const ok = r.request(gl, "n1", fakeFB(1024, 768));
    expect(ok).toBe(true);
    // Source is 1024×768 but the readback target is the 96×96 thumb FBO.
    expect(calls).toContain("readPixels 96x96");
    expect(calls).not.toContain("readPixels 1024x768");
    expect(calls).toContain("fenceSync");
    expect(r.pendingNodeIds()).toEqual(["n1"]);
  });

  it("returns false when the blit program fails to build", () => {
    const { gl } = makeGL({ linkFailure: true });
    const r = new AsyncThumbnailReadback();
    expect(r.request(gl, "n1", fakeFB(64, 64))).toBe(false);
    expect(r.pendingNodeIds()).toEqual([]);
  });

  it("request returns false when a slot is already pending for that node", () => {
    const { gl } = makeGL();
    const r = new AsyncThumbnailReadback();
    expect(r.request(gl, "n1", fakeFB(64, 64))).toBe(true);
    expect(r.request(gl, "n1", fakeFB(64, 64))).toBe(false);
  });

  it("poll returns nothing while the fence is unsignaled", () => {
    const { gl } = makeGL();
    const r = new AsyncThumbnailReadback();
    r.request(gl, "n1", fakeFB(32, 32));
    expect(r.poll(gl)).toEqual([]);
    expect(r.pendingNodeIds()).toEqual(["n1"]);
  });

  it("poll drains the slot once the fence signals", () => {
    const harness = makeGL();
    const { gl } = harness;
    const r = new AsyncThumbnailReadback();
    r.request(gl, "n1", fakeFB(32, 32));
    harness.setSignaled(true);
    const results = r.poll(gl);
    expect(results).toHaveLength(1);
    expect(results[0]!.nodeId).toBe("n1");
    expect(results[0]!.image.width).toBe(96);
    expect(results[0]!.image.height).toBe(96);
    expect(r.pendingNodeIds()).toEqual([]);
  });

  it("after a signaled drain, the next request kicks off a fresh in-flight slot", () => {
    const harness = makeGL();
    const { gl } = harness;
    const r = new AsyncThumbnailReadback();
    r.request(gl, "n1", fakeFB(32, 32));
    harness.setSignaled(true);
    r.poll(gl);
    harness.setSignaled(false);
    expect(r.request(gl, "n1", fakeFB(32, 32))).toBe(true);
    expect(r.pendingNodeIds()).toEqual(["n1"]);
  });

  it("handles multiple nodes independently", () => {
    const harness = makeGL();
    const { gl } = harness;
    const r = new AsyncThumbnailReadback();
    r.request(gl, "a", fakeFB(16, 16));
    r.request(gl, "b", fakeFB(16, 16));
    expect(r.pendingNodeIds().sort()).toEqual(["a", "b"]);
    harness.setSignaled(true);
    const out = r.poll(gl);
    expect(out.map((x) => x.nodeId).sort()).toEqual(["a", "b"]);
  });

  it("release tears down per-node resources", () => {
    const harness = makeGL();
    const { gl } = harness;
    const r = new AsyncThumbnailReadback();
    r.request(gl, "n1", fakeFB(16, 16));
    r.release(gl, "n1");
    expect(r.pendingNodeIds()).toEqual([]);
  });
});

describe("downsampleToThumb", () => {
  it("produces a thumb-sized ImageData", () => {
    const w = 32;
    const h = 32;
    const src = new Uint8Array(w * h * 4);
    for (let i = 0; i < src.length; i += 4) {
      src[i] = 200;
      src[i + 1] = 100;
      src[i + 2] = 50;
      src[i + 3] = 255;
    }
    const out = downsampleToThumb(src, w, h, 8);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    // Pixel(0,0) should reflect the constant source color.
    expect(out.data[0]).toBeGreaterThan(150);
    expect(out.data[1]).toBeGreaterThan(50);
    expect(out.data[3]).toBe(255);
  });
});
