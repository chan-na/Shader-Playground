import { describe, expect, it } from "vitest";
import { AsyncThumbnailReadback } from "./asyncReadback";
import { downsampleToThumb } from "./readback";

/**
 * Minimal stub of the WebGL2 surface used by AsyncThumbnailReadback. We
 * record method invocations and let tests step the fence state manually.
 */
function makeGL() {
  const calls: string[] = [];
  let signaled = false;
  const pboBytes = new Map<WebGLBuffer, Uint8Array>();
  let lastBoundPbo: WebGLBuffer | null = null;
  let lastReadBuffer: WebGLBuffer | null = null;
  const fakeFB = {
    fbo: {} as WebGLFramebuffer,
    color: { texture: {} },
  } as never;

  const gl = {
    // Enum constants — values irrelevant; identity-compared only.
    PIXEL_PACK_BUFFER: "PIXEL_PACK_BUFFER",
    READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
    READ_FRAMEBUFFER_BINDING: "READ_FRAMEBUFFER_BINDING",
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
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
      calls.push(`bindBuffer ${target}`);
      if (target === "PIXEL_PACK_BUFFER") lastBoundPbo = b;
    },
    bufferData: (_target: string, sizeOrData: number | ArrayBufferView) => {
      const size =
        typeof sizeOrData === "number" ? sizeOrData : sizeOrData.byteLength;
      if (lastBoundPbo) pboBytes.set(lastBoundPbo, new Uint8Array(size));
    },
    getParameter: () => null,
    bindFramebuffer: (target: string) => {
      calls.push(`bindFramebuffer ${target}`);
    },
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
      lastReadBuffer = lastBoundPbo;
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
    deleteBuffer: () => {
      calls.push("deleteBuffer");
    },
    getBufferSubData: (
      _target: string,
      _offset: number,
      out: ArrayBufferView,
    ) => {
      calls.push("getBufferSubData");
      const src = lastBoundPbo ? pboBytes.get(lastBoundPbo) : undefined;
      if (src && out instanceof Uint8Array) {
        out.set(src.subarray(0, out.length));
      }
    },
  };
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    fb: fakeFB,
    calls,
    setSignaled: (v: boolean) => {
      signaled = v;
    },
    lastReadBuffer: () => lastReadBuffer,
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
  it("request issues readPixels into a PBO and stamps a fence", () => {
    const { gl, calls } = makeGL();
    const r = new AsyncThumbnailReadback();
    const ok = r.request(gl, "n1", fakeFB(64, 64));
    expect(ok).toBe(true);
    expect(calls).toContain("readPixels 64x64");
    expect(calls).toContain("fenceSync");
    expect(r.pendingNodeIds()).toEqual(["n1"]);
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
    expect(results[0].nodeId).toBe("n1");
    expect(results[0].image.width).toBe(96);
    expect(results[0].image.height).toBe(96);
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
