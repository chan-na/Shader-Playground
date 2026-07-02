import { loadAudioFromFile } from "../core/assets/audioLoader";
import {
  cacheAudio,
  cacheImage,
  cacheMesh,
  cacheVideo,
  deleteCachedAudio,
  deleteCachedImage,
  deleteCachedMesh,
  deleteCachedVideo,
  loadCachedAudio,
  loadCachedImage,
  loadCachedMesh,
  loadCachedVideo,
} from "../core/assets/cache";
import { loadGltfFromFile } from "../core/assets/gltfLoader";
import { loadImageFromFile } from "../core/assets/imageLoader";
import { loadObjFromFile } from "../core/assets/objLoader";
import { loadVideoFromFile } from "../core/assets/videoLoader";
import type { GraphNode } from "../core/graph/types";
import { nextId } from "../utils/id";
import { useAssetStore } from "./assetStore";
import { useGraphStore } from "./graphStore";
import { useSelectionStore } from "./selectionStore";
import { toast } from "./toastStore";

export type AssetKind =
  | "obj"
  | "gltf"
  | "image"
  | "video"
  | "audio"
  | "unknown";

export function classifyFile(file: File): AssetKind {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".obj")) return "obj";
  if (lower.endsWith(".gltf") || lower.endsWith(".glb")) return "gltf";
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".bmp")
  ) {
    return "image";
  }
  if (file.type.startsWith("image/")) return "image";
  if (
    lower.endsWith(".mp4") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".ogv")
  ) {
    return "video";
  }
  if (file.type.startsWith("video/")) return "video";
  if (
    lower.endsWith(".mp3") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".aac") ||
    lower.endsWith(".flac")
  ) {
    return "audio";
  }
  if (file.type.startsWith("audio/")) return "audio";
  return "unknown";
}

export interface ImportResult {
  kind: AssetKind;
  nodeId: string;
  assetId: string;
}

async function importFile(
  file: File,
  position?: { x: number; y: number },
): Promise<ImportResult | null> {
  const kind = classifyFile(file);
  const assetStore = useAssetStore.getState();
  const graphStore = useGraphStore.getState();
  const selection = useSelectionStore.getState();

  if (kind === "obj") {
    const handle = await loadObjFromFile(file);
    assetStore.addMesh(handle);
    void cacheMesh(handle).catch(() => {});
    const id = nextId("mesh");
    const node: GraphNode = {
      id,
      kind: "mesh",
      primitive: "cube",
      assetId: handle.id,
    };
    graphStore.addNode(node, position ?? { x: -240, y: 0 });
    selection.select(id);
    return { kind, nodeId: id, assetId: handle.id };
  }

  if (kind === "gltf") {
    const handle = await loadGltfFromFile(file);
    assetStore.addMesh(handle);
    void cacheMesh(handle).catch(() => {});
    const id = nextId("mesh");
    const node: GraphNode = {
      id,
      kind: "mesh",
      primitive: "cube",
      assetId: handle.id,
    };
    graphStore.addNode(node, position ?? { x: -240, y: 0 });
    selection.select(id);
    return { kind, nodeId: id, assetId: handle.id };
  }

  if (kind === "image") {
    const handle = await loadImageFromFile(file);
    assetStore.addImage(handle);
    void cacheImage(handle, file).catch(() => {});
    const id = nextId("image");
    const node: GraphNode = { id, kind: "image", assetId: handle.id };
    graphStore.addNode(node, position ?? { x: -240, y: 160 });
    selection.select(id);
    return { kind, nodeId: id, assetId: handle.id };
  }

  if (kind === "video") {
    const { handle, blob } = await loadVideoFromFile(file);
    assetStore.addVideo(handle, blob);
    void cacheVideo(handle, blob).catch(() => {});
    const id = nextId("video");
    const node: GraphNode = {
      id,
      kind: "video",
      assetId: handle.id,
      playing: true,
      loop: true,
      muted: true,
    };
    graphStore.addNode(node, position ?? { x: -240, y: 320 });
    selection.select(id);
    return { kind, nodeId: id, assetId: handle.id };
  }

  if (kind === "audio") {
    const { handle, blob } = await loadAudioFromFile(file);
    assetStore.addAudio(handle, blob);
    void cacheAudio(handle, blob).catch(() => {});
    const id = nextId("audio");
    const node: GraphNode = {
      id,
      kind: "audio",
      sourceKind: "file",
      assetId: handle.id,
      fftSize: 256,
      smoothing: 0.8,
      playing: true,
      loop: true,
    };
    graphStore.addNode(node, position ?? { x: -240, y: 480 });
    selection.select(id);
    return { kind, nodeId: id, assetId: handle.id };
  }

  return null;
}

/**
 * Collect the asset ids referenced by a freshly-loaded graph and hydrate the
 * asset store from IndexedDB. Single entry point for every load path (JSON
 * import, session/share restore) so cached custom meshes/images/videos/audio
 * survive a reload instead of silently falling back to placeholders.
 */
export function hydrateGraphAssets(nodes: GraphNode[]): void {
  const meshes: string[] = [];
  const images: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  for (const n of nodes) {
    if (n.kind === "mesh" && n.assetId) meshes.push(n.assetId);
    else if (n.kind === "image" && n.assetId) images.push(n.assetId);
    else if (n.kind === "video" && n.assetId) videos.push(n.assetId);
    else if (n.kind === "audio" && n.assetId) audios.push(n.assetId);
  }
  if (meshes.length || images.length || videos.length || audios.length) {
    void hydrateAssetsFor({ meshes, images, videos, audios });
  }
}

// Hydrate the asset store from IndexedDB for the assetIds referenced by a
// freshly-loaded project graph. Missing IDs are silently skipped — the
// MeshNode falls back to its primitive and the ImageNode shows "No image".
export async function hydrateAssetsFor(assetIds: {
  meshes: string[];
  images: string[];
  videos?: string[];
  audios?: string[];
}) {
  const assetStore = useAssetStore.getState();
  await Promise.all(
    assetIds.meshes.map(async (id) => {
      if (assetStore.meshes[id]) return;
      const handle = await loadCachedMesh(id);
      if (handle) useAssetStore.getState().addMesh(handle);
    }),
  );
  await Promise.all(
    assetIds.images.map(async (id) => {
      if (assetStore.images[id]) return;
      const cached = await loadCachedImage(id);
      if (cached) useAssetStore.getState().addImage(cached.handle);
    }),
  );
  if (assetIds.videos?.length) {
    await Promise.all(
      assetIds.videos.map(async (id) => {
        if (assetStore.videos[id]) return;
        const cached = await loadCachedVideo(id);
        if (cached)
          useAssetStore.getState().addVideo(cached.handle, cached.blob);
      }),
    );
  }
  if (assetIds.audios?.length) {
    await Promise.all(
      assetIds.audios.map(async (id) => {
        if (assetStore.audios[id]) return;
        const cached = await loadCachedAudio(id);
        if (cached)
          useAssetStore.getState().addAudio(cached.handle, cached.blob);
      }),
    );
  }
}

// Remove an asset from the in-memory store *and* its IndexedDB record. Without
// the IDB delete the cache grows unbounded across sessions, eventually
// consuming the origin's storage quota and breaking autosave.
export function forgetMesh(id: string): void {
  useAssetStore.getState().removeMesh(id);
  void deleteCachedMesh(id);
}

export function forgetImage(id: string): void {
  useAssetStore.getState().removeImage(id);
  void deleteCachedImage(id);
}

export function forgetVideo(id: string): void {
  useAssetStore.getState().removeVideo(id);
  void deleteCachedVideo(id);
}

export function forgetAudio(id: string): void {
  useAssetStore.getState().removeAudio(id);
  void deleteCachedAudio(id);
}

export async function importFiles(
  files: FileList | File[],
  basePosition?: { x: number; y: number },
): Promise<ImportResult[]> {
  const arr = Array.from(files);
  const results: ImportResult[] = [];
  for (const [i, file] of arr.entries()) {
    const offset = basePosition ?? { x: -240, y: 0 };
    const pos = { x: offset.x, y: offset.y + i * 100 };
    try {
      const r = await importFile(file, pos);
      if (r) results.push(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Asset import failed:", file.name, e);
      toast.error(`자산 임포트 실패 (${file.name}): ${msg}`);
    }
  }
  return results;
}
