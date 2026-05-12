import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadImageFromFile } from "./imageLoader";

interface FakeBitmap {
  width: number;
  height: number;
}

describe("loadImageFromFile", () => {
  const originalCreateImageBitmap = (
    globalThis as unknown as { createImageBitmap?: unknown }
  ).createImageBitmap;

  beforeEach(() => {
    // jsdom omits createImageBitmap; install a stub that returns a fake bitmap
    // and records the options the loader passed in.
    (
      globalThis as unknown as {
        createImageBitmap: (
          blob: Blob,
          opts?: ImageBitmapOptions,
        ) => Promise<FakeBitmap>;
      }
    ).createImageBitmap = vi.fn(
      async (_blob: Blob, _opts?: ImageBitmapOptions) => ({
        width: 32,
        height: 16,
      }),
    );
  });

  afterEach(() => {
    if (originalCreateImageBitmap === undefined) {
      delete (globalThis as unknown as { createImageBitmap?: unknown })
        .createImageBitmap;
    } else {
      (
        globalThis as unknown as { createImageBitmap: unknown }
      ).createImageBitmap = originalCreateImageBitmap;
    }
  });

  it("returns an ImageHandle with the file name + bitmap dimensions", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "photo.png", {
      type: "image/png",
    });
    const handle = await loadImageFromFile(file);
    expect(handle.name).toBe("photo.png");
    expect(handle.width).toBe(32);
    expect(handle.height).toBe(16);
    expect(handle.bitmap).toBeDefined();
    expect(typeof handle.id).toBe("string");
    expect(handle.id.length).toBeGreaterThan(0);
  });

  it("requests createImageBitmap with premultiplyAlpha:'none' to preserve native orientation", async () => {
    const file = new File([new Uint8Array([0])], "x.png");
    await loadImageFromFile(file);
    const spy = (
      globalThis as unknown as {
        createImageBitmap: ReturnType<typeof vi.fn>;
      }
    ).createImageBitmap;
    expect(spy).toHaveBeenCalledWith(file, { premultiplyAlpha: "none" });
  });

  it("propagates createImageBitmap rejection", async () => {
    (
      globalThis as unknown as {
        createImageBitmap: (
          blob: Blob,
          opts?: ImageBitmapOptions,
        ) => Promise<FakeBitmap>;
      }
    ).createImageBitmap = vi.fn(async () => {
      throw new Error("decode failed");
    });
    const file = new File([new Uint8Array([0])], "bad.png");
    await expect(loadImageFromFile(file)).rejects.toThrow("decode failed");
  });

  it("falls back to a non-crypto id when crypto.randomUUID is unavailable", async () => {
    // `globalThis.crypto` is a getter — Object.defineProperty to override
    // and restore around the test.
    const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });
    try {
      const file = new File([new Uint8Array([0])], "noop.png");
      const handle = await loadImageFromFile(file);
      expect(handle.id.startsWith("img-")).toBe(true);
    } finally {
      if (desc) Object.defineProperty(globalThis, "crypto", desc);
    }
  });
});
