import { describe, expect, it, vi } from "vitest";
import { createFakeGl } from "./fakeGl";
import {
  createColorTexture,
  createImageTexture,
  disposeTexture,
  FBO_TEXTURE_PARAMS,
  IMAGE_TEXTURE_PARAMS,
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

// [E-3] No-drift contract: the GL calls below must derive from
// FBO_TEXTURE_PARAMS / IMAGE_TEXTURE_PARAMS, not independent literals — this
// pins the exact enum values applied so the constants the Inspector reads can
// never silently diverge from what the GL layer actually does.
describe("createColorTexture — applies FBO_TEXTURE_PARAMS verbatim [E-3]", () => {
  it("sets LINEAR filters + CLAMP_TO_EDGE wrap and never touches mipmap/flip", () => {
    const gl = createFakeGl();
    const texParameteri = vi.spyOn(gl, "texParameteri");
    const generateMipmap = vi.spyOn(gl, "generateMipmap");
    const pixelStorei = vi.spyOn(gl, "pixelStorei");

    createColorTexture(gl, 8, 8);

    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR,
    );
    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      gl.LINEAR,
    );
    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.CLAMP_TO_EDGE,
    );
    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      gl.CLAMP_TO_EDGE,
    );
    expect(generateMipmap).not.toHaveBeenCalled();
    expect(pixelStorei).not.toHaveBeenCalled();

    // Sanity: the constant itself says what the calls above assert.
    expect(FBO_TEXTURE_PARAMS.mipmaps).toBe(false);
    expect(FBO_TEXTURE_PARAMS.flipY).toBe(false);
  });
});

describe("createImageTexture — applies IMAGE_TEXTURE_PARAMS verbatim [E-3]", () => {
  it("sets LINEAR_MIPMAP_LINEAR/LINEAR filters, REPEAT wrap, generates mipmaps, and flips Y on upload only", () => {
    const gl = createFakeGl();
    const texParameteri = vi.spyOn(gl, "texParameteri");
    const generateMipmap = vi.spyOn(gl, "generateMipmap");
    const pixelStorei = vi.spyOn(gl, "pixelStorei");
    const fakeBitmap = { width: 4, height: 4 } as unknown as ImageBitmap;

    createImageTexture(gl, fakeBitmap);

    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      gl.LINEAR,
    );
    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.REPEAT,
    );
    expect(texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      gl.REPEAT,
    );
    expect(generateMipmap).toHaveBeenCalledWith(gl.TEXTURE_2D);
    // Flip is toggled on before upload and back off after, never left on.
    expect(pixelStorei).toHaveBeenNthCalledWith(
      1,
      gl.UNPACK_FLIP_Y_WEBGL,
      true,
    );
    expect(pixelStorei).toHaveBeenNthCalledWith(
      2,
      gl.UNPACK_FLIP_Y_WEBGL,
      false,
    );

    expect(IMAGE_TEXTURE_PARAMS.mipmaps).toBe(true);
    expect(IMAGE_TEXTURE_PARAMS.flipY).toBe(true);
  });
});
