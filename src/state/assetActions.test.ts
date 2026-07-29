import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeometryHandle, ImageHandle } from "../core/assets/types";

// Mock loaders + cache before importing the module under test so the SUT picks
// up the mocked versions. The real loaders touch DOM/Blob APIs that jsdom
// either omits or implements partially; mocking keeps the tests pure.
vi.mock("../core/assets/objLoader", () => ({
  loadObjFromFile: vi.fn(),
}));
vi.mock("../core/assets/gltfLoader", () => ({
  loadGltfFromFile: vi.fn(),
}));
vi.mock("../core/assets/imageLoader", () => ({
  loadImageFromFile: vi.fn(),
}));
// The factory must cover *every* named export assetActions imports, video and
// audio included — a missing key resolves to `undefined` at the call site and
// blows up the moment a test exercises that path.
vi.mock("../core/assets/cache", () => ({
  cacheAudio: vi.fn().mockResolvedValue(undefined),
  cacheImage: vi.fn().mockResolvedValue(undefined),
  cacheMesh: vi.fn().mockResolvedValue(undefined),
  cacheVideo: vi.fn().mockResolvedValue(undefined),
  deleteCachedAudio: vi.fn().mockResolvedValue(undefined),
  deleteCachedImage: vi.fn().mockResolvedValue(undefined),
  deleteCachedMesh: vi.fn().mockResolvedValue(undefined),
  deleteCachedVideo: vi.fn().mockResolvedValue(undefined),
  loadCachedAudio: vi.fn(),
  loadCachedImage: vi.fn(),
  loadCachedMesh: vi.fn(),
  loadCachedVideo: vi.fn(),
}));

import {
  cacheImage,
  cacheMesh,
  deleteCachedImage,
  deleteCachedMesh,
  loadCachedAudio,
  loadCachedImage,
  loadCachedMesh,
  loadCachedVideo,
} from "../core/assets/cache";
import { loadGltfFromFile } from "../core/assets/gltfLoader";
import { loadImageFromFile } from "../core/assets/imageLoader";
import { loadObjFromFile } from "../core/assets/objLoader";
import { clearLogBuffer, getLogBuffer } from "../utils/log";
import {
  classifyFile,
  forgetImage,
  forgetMesh,
  hydrateAssetsFor,
  hydrateGraphAssets,
  importFiles,
} from "./assetActions";
import { useAssetStore } from "./assetStore";
import { useGraphStore } from "./graphStore";
import { useSelectionStore } from "./selectionStore";
import { useToastStore } from "./toastStore";

const mockFile = (name: string, type = "") =>
  new File([new Uint8Array()], name, { type });

const meshHandle = (id: string, name = id): GeometryHandle => ({
  id,
  name,
  data: { attributes: [], vertexCount: 0 },
});

const imageHandle = (id: string, name = id): ImageHandle => ({
  id,
  name,
  width: 1,
  height: 1,
  bitmap: null,
});

describe("classifyFile", () => {
  it("detects OBJ by extension", () => {
    expect(classifyFile(mockFile("cube.obj"))).toBe("obj");
    expect(classifyFile(mockFile("Cube.OBJ"))).toBe("obj");
  });

  it("detects glTF/glb by extension", () => {
    expect(classifyFile(mockFile("scene.gltf"))).toBe("gltf");
    expect(classifyFile(mockFile("scene.glb"))).toBe("gltf");
  });

  it("detects images by extension", () => {
    expect(classifyFile(mockFile("a.png"))).toBe("image");
    expect(classifyFile(mockFile("a.jpg"))).toBe("image");
    expect(classifyFile(mockFile("a.jpeg"))).toBe("image");
    expect(classifyFile(mockFile("a.webp"))).toBe("image");
    expect(classifyFile(mockFile("a.gif"))).toBe("image");
    expect(classifyFile(mockFile("a.bmp"))).toBe("image");
  });

  it("detects images by MIME when extension is missing", () => {
    expect(classifyFile(mockFile("photo", "image/png"))).toBe("image");
  });

  it("detects audio by extension", () => {
    expect(classifyFile(mockFile("song.mp3"))).toBe("audio");
    expect(classifyFile(mockFile("clip.wav"))).toBe("audio");
    expect(classifyFile(mockFile("voice.ogg"))).toBe("audio");
    expect(classifyFile(mockFile("track.m4a"))).toBe("audio");
    expect(classifyFile(mockFile("loop.aac"))).toBe("audio");
    expect(classifyFile(mockFile("master.flac"))).toBe("audio");
  });

  it("detects audio by MIME when extension is missing", () => {
    expect(classifyFile(mockFile("clip", "audio/mpeg"))).toBe("audio");
  });

  it("returns unknown for unsupported types", () => {
    expect(classifyFile(mockFile("readme.txt"))).toBe("unknown");
    expect(classifyFile(mockFile("script.js"))).toBe("unknown");
  });
});

describe("importFiles", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    useAssetStore.setState({ meshes: {}, images: {}, rev: 0 });
    useSelectionStore.setState({ selectedNodeId: null });
    vi.clearAllMocks();
  });

  it("imports OBJ → adds mesh asset, mesh node, selects it, primes cache", async () => {
    const handle = meshHandle("mesh-obj-1");
    vi.mocked(loadObjFromFile).mockResolvedValue(handle);

    const results = await importFiles([mockFile("cube.obj")]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "obj", assetId: handle.id });
    expect(useAssetStore.getState().meshes[handle.id]).toBe(handle);
    const node = useGraphStore.getState().nodes[0];
    expect(node).toBeDefined();
    expect(node?.kind).toBe("mesh");
    expect(useSelectionStore.getState().selectedNodeId).toBe(node?.id);
    expect(cacheMesh).toHaveBeenCalledWith(handle);
  });

  it("imports glTF → adds mesh asset and mesh node", async () => {
    const handle = meshHandle("mesh-glb-1");
    vi.mocked(loadGltfFromFile).mockResolvedValue(handle);

    const results = await importFiles([mockFile("scene.glb")]);

    expect(results[0]?.kind).toBe("gltf");
    expect(useAssetStore.getState().meshes[handle.id]).toBe(handle);
    expect(cacheMesh).toHaveBeenCalledWith(handle);
  });

  it("imports image → adds image asset, image node, primes cache with blob", async () => {
    const handle = imageHandle("img-1");
    vi.mocked(loadImageFromFile).mockResolvedValue(handle);
    const file = mockFile("a.png");

    const results = await importFiles([file]);

    expect(results[0]?.kind).toBe("image");
    expect(useAssetStore.getState().images[handle.id]).toBe(handle);
    expect(cacheImage).toHaveBeenCalledWith(handle, file);
  });

  it("skips unknown extensions and returns no result for them", async () => {
    const results = await importFiles([mockFile("readme.txt")]);
    expect(results).toEqual([]);
    expect(useGraphStore.getState().nodes).toHaveLength(0);
  });

  // --- #34: unsupported files used to vanish without a word --------------

  it("raises a single aggregate warning when nothing could be imported", async () => {
    useToastStore.getState().clear();

    const results = await importFiles([
      mockFile("readme.txt"),
      mockFile("notes.md"),
    ]);

    expect(results).toEqual([]);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.kind).toBe("warning");
    expect(toasts[0]?.message).toContain("readme.txt");
    expect(toasts[0]?.message).toContain("notes.md");
  });

  it("stays quiet about skipped sidecars when at least one file imported", async () => {
    // Selecting cube.obj together with its cube.mtl is the normal flow; the
    // ignored sidecar must not be reported as a failure.
    useToastStore.getState().clear();
    vi.mocked(loadObjFromFile).mockResolvedValue(meshHandle("mesh-sidecar"));

    const results = await importFiles([
      mockFile("cube.obj"),
      mockFile("cube.mtl"),
    ]);

    expect(results).toHaveLength(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  // --- #23: best-effort cache writes are logged, never toasted ------------

  it("logs a warning when priming the IndexedDB cache fails", async () => {
    const handle = meshHandle("mesh-quota");
    vi.mocked(loadObjFromFile).mockResolvedValue(handle);
    vi.mocked(cacheMesh).mockRejectedValueOnce(new Error("QuotaExceededError"));
    useToastStore.getState().clear();
    clearLogBuffer();

    const results = await importFiles([mockFile("cube.obj")]);

    // The import itself still succeeds — the cache is an optimisation.
    expect(results).toHaveLength(1);
    await vi.waitFor(() => {
      const hit = getLogBuffer().find((e) =>
        e.message.includes("asset cache write failed"),
      );
      expect(hit).toBeDefined();
      expect(hit?.level).toBe("warn");
      // Same category cache.ts uses for its own read-path warnings.
      expect(hit?.category).toBe("autosave");
      expect(hit?.message).toContain("mesh-quota");
    });
  });

  it("does not toast when the cache write fails", async () => {
    // Private-mode windows reject every IDB put; an error banner per dropped
    // file would make the app unusable there.
    vi.mocked(loadImageFromFile).mockResolvedValue(imageHandle("img-private"));
    vi.mocked(cacheImage).mockRejectedValueOnce(new Error("SecurityError"));
    useToastStore.getState().clear();

    const results = await importFiles([mockFile("a.png")]);
    await vi.waitFor(() => {
      expect(
        getLogBuffer().some((e) => e.message.includes("image img-private")),
      ).toBe(true);
    });

    expect(results).toHaveLength(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("logs and continues when a loader rejects, importing other files", async () => {
    const goodHandle = meshHandle("mesh-good");
    vi.mocked(loadObjFromFile)
      .mockRejectedValueOnce(new Error("parse failed"))
      .mockResolvedValueOnce(goodHandle);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await importFiles([
      mockFile("bad.obj"),
      mockFile("good.obj"),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.assetId).toBe(goodHandle.id);
    expect(errSpy).toHaveBeenCalledWith(
      "Asset import failed:",
      "bad.obj",
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it("surfaces a toast.error with file name + reason when a loader rejects", async () => {
    useToastStore.getState().clear();
    vi.mocked(loadObjFromFile).mockRejectedValueOnce(new Error("parse failed"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await importFiles([mockFile("bad.obj")]);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.kind).toBe("error");
    expect(toasts[0]?.message).toContain("bad.obj");
    expect(toasts[0]?.message).toContain("parse failed");
    errSpy.mockRestore();
  });

  it("offsets node positions per file index when basePosition omitted", async () => {
    vi.mocked(loadObjFromFile)
      .mockResolvedValueOnce(meshHandle("m1"))
      .mockResolvedValueOnce(meshHandle("m2"));

    const results = await importFiles([mockFile("a.obj"), mockFile("b.obj")]);

    const positions = useGraphStore.getState().positions;
    expect(positions[results[0]!.nodeId]).toEqual({ x: -240, y: 0 });
    expect(positions[results[1]!.nodeId]).toEqual({ x: -240, y: 100 });
  });

  it("uses caller-supplied basePosition as the origin for offsets", async () => {
    vi.mocked(loadObjFromFile).mockResolvedValueOnce(meshHandle("m1"));

    const [r] = await importFiles([mockFile("a.obj")], { x: 50, y: -30 });

    const positions = useGraphStore.getState().positions;
    expect(positions[r!.nodeId]).toEqual({ x: 50, y: -30 });
  });
});

describe("forgetMesh / forgetImage", () => {
  beforeEach(() => {
    useAssetStore.setState({ meshes: {}, images: {}, rev: 0 });
    vi.clearAllMocks();
  });

  it("forgetMesh drops the in-memory entry AND fires an IDB delete", () => {
    const m = {
      id: "m1",
      name: "m1",
      data: { attributes: [], vertexCount: 0 },
    };
    useAssetStore.setState({ meshes: { m1: m }, images: {}, rev: 1 });

    forgetMesh("m1");

    expect(useAssetStore.getState().meshes.m1).toBeUndefined();
    expect(deleteCachedMesh).toHaveBeenCalledWith("m1");
  });

  it("forgetImage drops the in-memory entry AND fires an IDB delete", () => {
    const i = { id: "i1", name: "i1", width: 1, height: 1, bitmap: null };
    useAssetStore.setState({ meshes: {}, images: { i1: i }, rev: 1 });

    forgetImage("i1");

    expect(useAssetStore.getState().images.i1).toBeUndefined();
    expect(deleteCachedImage).toHaveBeenCalledWith("i1");
  });
});

describe("hydrateAssetsFor", () => {
  beforeEach(() => {
    useAssetStore.setState({ meshes: {}, images: {}, rev: 0 });
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads cached meshes and images for missing IDs", async () => {
    const m = meshHandle("m1");
    const img = imageHandle("i1");
    vi.mocked(loadCachedMesh).mockResolvedValue(m);
    vi.mocked(loadCachedImage).mockResolvedValue({
      handle: img,
      blob: new Blob(),
    });

    await hydrateAssetsFor({ meshes: ["m1"], images: ["i1"] });

    expect(useAssetStore.getState().meshes.m1).toBe(m);
    expect(useAssetStore.getState().images.i1).toBe(img);
  });

  it("skips IDs already present in the asset store", async () => {
    const existing = meshHandle("m1");
    useAssetStore.setState({
      meshes: { m1: existing },
      images: {},
      rev: 1,
    });

    await hydrateAssetsFor({ meshes: ["m1"], images: [] });

    expect(loadCachedMesh).not.toHaveBeenCalled();
  });

  it("silently skips IDs that are not in the cache", async () => {
    vi.mocked(loadCachedMesh).mockResolvedValue(null);
    vi.mocked(loadCachedImage).mockResolvedValue(null);

    await hydrateAssetsFor({ meshes: ["missing"], images: ["missing"] });

    expect(useAssetStore.getState().meshes).toEqual({});
    expect(useAssetStore.getState().images).toEqual({});
  });
});

describe("hydrateGraphAssets (H5)", () => {
  beforeEach(() => {
    useAssetStore.setState({ meshes: {}, images: {}, rev: 0 });
    vi.clearAllMocks();
  });

  it("collects assetIds from graph nodes and hydrates the store", async () => {
    const m = meshHandle("mesh1");
    const img = imageHandle("img1");
    vi.mocked(loadCachedMesh).mockResolvedValue(m);
    vi.mocked(loadCachedImage).mockResolvedValue({
      handle: img,
      blob: new Blob(),
    });

    hydrateGraphAssets([
      { id: "n1", kind: "mesh", primitive: "cube", assetId: "mesh1" },
      { id: "n2", kind: "image", assetId: "img1" },
      // No assetId → contributes nothing (falls back to placeholder).
      { id: "n3", kind: "mesh", primitive: "sphere" },
      { id: "n4", kind: "output" },
    ]);

    await vi.waitFor(() => {
      expect(useAssetStore.getState().meshes.mesh1).toBe(m);
      expect(useAssetStore.getState().images.img1).toBe(img);
    });
    expect(loadCachedMesh).toHaveBeenCalledTimes(1);
    expect(loadCachedMesh).toHaveBeenCalledWith("mesh1");
  });

  // #30 — hydrateAssetsFor snapshots the store once, before its first await,
  // so duplicate ids all clear the "already loaded?" guard and each fires its
  // own IndexedDB read plus a redundant store write.
  it("de-duplicates repeated assetIds across all four asset lists", async () => {
    const m = meshHandle("shared-mesh");
    vi.mocked(loadCachedMesh).mockResolvedValue(m);
    vi.mocked(loadCachedImage).mockResolvedValue(null);
    vi.mocked(loadCachedVideo).mockResolvedValue(null);
    vi.mocked(loadCachedAudio).mockResolvedValue(null);

    hydrateGraphAssets([
      { id: "n1", kind: "mesh", primitive: "cube", assetId: "shared-mesh" },
      { id: "n2", kind: "mesh", primitive: "sphere", assetId: "shared-mesh" },
      { id: "n3", kind: "image", assetId: "shared-img" },
      { id: "n4", kind: "image", assetId: "shared-img" },
      {
        id: "n5",
        kind: "video",
        assetId: "shared-vid",
        playing: true,
        loop: true,
        muted: true,
      },
      {
        id: "n6",
        kind: "video",
        assetId: "shared-vid",
        playing: true,
        loop: true,
        muted: true,
      },
      {
        id: "n7",
        kind: "audio",
        sourceKind: "file",
        assetId: "shared-aud",
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
      {
        id: "n8",
        kind: "audio",
        sourceKind: "file",
        assetId: "shared-aud",
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);

    await vi.waitFor(() => {
      expect(useAssetStore.getState().meshes["shared-mesh"]).toBe(m);
      expect(loadCachedAudio).toHaveBeenCalled();
    });
    expect(loadCachedMesh).toHaveBeenCalledTimes(1);
    expect(loadCachedImage).toHaveBeenCalledTimes(1);
    expect(loadCachedVideo).toHaveBeenCalledTimes(1);
    expect(loadCachedAudio).toHaveBeenCalledTimes(1);
  });

  it("does not touch IndexedDB when no node references an asset", async () => {
    hydrateGraphAssets([
      { id: "n1", kind: "mesh", primitive: "cube" },
      { id: "n2", kind: "output" },
    ]);
    // Give any accidental async a tick to run before asserting no-op.
    await Promise.resolve();
    expect(loadCachedMesh).not.toHaveBeenCalled();
    expect(loadCachedImage).not.toHaveBeenCalled();
  });
});
