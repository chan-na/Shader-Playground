import { describe, expect, it } from "vitest";
import { createFakeGl } from "./fakeGl";
import {
  createColorTexture,
  createImageTexture,
  disposeTexture,
} from "./texture";

describe("createColorTexture", () => {
  it("allocates a RGBA8 texture at the requested size", () => {
    const gl = createFakeGl();
    const tex = createColorTexture(gl, 256, 128);
    expect(tex.width).toBe(256);
    expect(tex.height).toBe(128);
    expect(tex.format).toBe(gl.RGBA);
    expect(tex.internalFormat).toBe(gl.RGBA8);
    expect(tex.type).toBe(gl.UNSIGNED_BYTE);
  });

  it("throws when createTexture returns null", () => {
    const gl = createFakeGl({ resourceFailure: true });
    expect(() => createColorTexture(gl, 32, 32)).toThrow();
  });
});

describe("createImageTexture", () => {
  it("derives width/height from the source bitmap dimensions", () => {
    const gl = createFakeGl();
    const fakeBitmap = { width: 100, height: 50 } as unknown as ImageBitmap;
    const tex = createImageTexture(gl, fakeBitmap);
    expect(tex.width).toBe(100);
    expect(tex.height).toBe(50);
  });

  it("defaults width/height to 1 when source has no dimensions", () => {
    const gl = createFakeGl();
    const sourceNoDims = {} as unknown as TexImageSource;
    const tex = createImageTexture(gl, sourceNoDims);
    expect(tex.width).toBe(1);
    expect(tex.height).toBe(1);
  });

  it("throws when createTexture returns null", () => {
    const gl = createFakeGl({ resourceFailure: true });
    const fakeBitmap = { width: 1, height: 1 } as unknown as ImageBitmap;
    expect(() => createImageTexture(gl, fakeBitmap)).toThrow();
  });
});

describe("disposeTexture", () => {
  it("does not throw", () => {
    const gl = createFakeGl();
    const tex = createColorTexture(gl, 16, 16);
    expect(() => disposeTexture(gl, tex)).not.toThrow();
  });
});
