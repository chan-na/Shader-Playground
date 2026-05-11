import {
  cacheImage,
  cacheMesh,
  loadCachedImage,
  loadCachedMesh,
} from "../core/assets/cache";
import { loadGltfFromFile } from "../core/assets/gltfLoader";
import { loadImageFromFile } from "../core/assets/imageLoader";
import { loadObjFromFile } from "../core/assets/objLoader";
import type { GraphNode } from "../core/graph/types";
import { nextId } from "../utils/id";
import { useAssetStore } from "./assetStore";
import { useGraphStore } from "./graphStore";
import { useSelectionStore } from "./selectionStore";

export type AssetKind = "obj" | "gltf" | "image" | "unknown";

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

  return null;
}

// Hydrate the asset store from IndexedDB for the assetIds referenced by a
// freshly-loaded project graph. Missing IDs are silently skipped — the
// MeshNode falls back to its primitive and the ImageNode shows "No image".
export async function hydrateAssetsFor(assetIds: {
  meshes: string[];
  images: string[];
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
}

export async function importFiles(
  files: FileList | File[],
  basePosition?: { x: number; y: number },
): Promise<ImportResult[]> {
  const arr = Array.from(files);
  const results: ImportResult[] = [];
  for (let i = 0; i < arr.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: loop bound by arr.length
    const file = arr[i]!;
    const offset = basePosition ?? { x: -240, y: 0 };
    const pos = { x: offset.x, y: offset.y + i * 100 };
    try {
      const r = await importFile(file, pos);
      if (r) results.push(r);
    } catch (e) {
      console.error("Asset import failed:", file.name, e);
    }
  }
  return results;
}
