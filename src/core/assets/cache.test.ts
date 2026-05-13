import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheImage,
  cacheMesh,
  deleteCachedImage,
  deleteCachedMesh,
  loadCachedImage,
  loadCachedMesh,
} from "./cache";
import type { GeometryHandle, ImageHandle } from "./types";

const meshHandle = (id: string): GeometryHandle => ({
  id,
  name: id,
  data: {
    vertexCount: 3,
    attributes: [
      {
        name: "a_position",
        size: 3,
        data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      },
    ],
    indices: new Uint16Array([0, 1, 2]),
  },
});

const imageHandle = (id: string): ImageHandle => ({
  id,
  name: id,
  width: 2,
  height: 2,
  bitmap: null,
});

beforeEach(() => {
  // jsdom omits createImageBitmap — stub a deterministic ImageBitmap-ish object
  // so the loadCachedImage code path can complete.
  globalThis.createImageBitmap = vi.fn().mockImplementation(
    async (blob: Blob) =>
      ({
        width: 2,
        height: 2,
        _blobSize: blob.size,
      }) as unknown as ImageBitmap,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cache (IndexedDB-backed)", () => {
  it("round-trips a mesh handle through cacheMesh / loadCachedMesh", async () => {
    const handle = meshHandle("mesh-rt");
    await cacheMesh(handle);

    const loaded = await loadCachedMesh("mesh-rt");
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("mesh-rt");
    expect(loaded?.data.vertexCount).toBe(3);
    expect(loaded?.data.attributes[0]?.name).toBe("a_position");
    expect(Array.from(loaded?.data.attributes[0]?.data ?? [])).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ]);
    expect(loaded?.data.indices).toBeInstanceOf(Uint16Array);
  });

  it("preserves Uint32Array indices through round-trip", async () => {
    const handle: GeometryHandle = {
      id: "mesh-u32",
      name: "mesh-u32",
      data: {
        vertexCount: 1,
        attributes: [],
        indices: new Uint32Array([100_000, 200_000, 300_000]),
      },
    };
    await cacheMesh(handle);
    const loaded = await loadCachedMesh("mesh-u32");
    expect(loaded?.data.indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(loaded?.data.indices ?? [])).toEqual([
      100_000, 200_000, 300_000,
    ]);
  });

  it("returns null when loading an unknown mesh id", async () => {
    const loaded = await loadCachedMesh("does-not-exist");
    expect(loaded).toBeNull();
  });

  it("round-trips an image handle through cacheImage / loadCachedImage", async () => {
    const handle = imageHandle("img-rt");
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    await cacheImage(handle, blob);

    const result = await loadCachedImage("img-rt");
    expect(result).not.toBeNull();
    expect(result?.handle.id).toBe("img-rt");
    expect(result?.handle.width).toBe(2);
    expect(result?.handle.height).toBe(2);
    expect(result?.handle.bitmap).toBeTruthy();
    // fake-indexeddb structured-clones blobs through its own polyfill, so
    // instanceof is unreliable across realms — assert it's at least defined.
    expect(result?.blob).toBeDefined();
    expect(globalThis.createImageBitmap).toHaveBeenCalled();
  });

  it("returns null when loading an unknown image id", async () => {
    const loaded = await loadCachedImage("missing-img");
    expect(loaded).toBeNull();
  });

  it("loadCachedImage swallows createImageBitmap rejection and returns null", async () => {
    const handle = imageHandle("img-bad-bitmap");
    await cacheImage(handle, new Blob([new Uint8Array([0])]));
    globalThis.createImageBitmap = vi
      .fn()
      .mockRejectedValue(new Error("decode failed"));

    expect(await loadCachedImage("img-bad-bitmap")).toBeNull();
  });

  it("deleteCachedMesh removes the record so subsequent loads return null", async () => {
    const handle = meshHandle("mesh-del");
    await cacheMesh(handle);
    expect(await loadCachedMesh("mesh-del")).not.toBeNull();

    await deleteCachedMesh("mesh-del");

    expect(await loadCachedMesh("mesh-del")).toBeNull();
  });

  it("deleteCachedImage removes the record so subsequent loads return null", async () => {
    const handle = imageHandle("img-del");
    await cacheImage(handle, new Blob([new Uint8Array([9])]));
    expect(await loadCachedImage("img-del")).not.toBeNull();

    await deleteCachedImage("img-del");

    expect(await loadCachedImage("img-del")).toBeNull();
  });

  it("deleteCachedMesh / deleteCachedImage are no-ops for unknown ids", async () => {
    await expect(deleteCachedMesh("never-existed")).resolves.toBeUndefined();
    await expect(deleteCachedImage("never-existed")).resolves.toBeUndefined();
  });
});
