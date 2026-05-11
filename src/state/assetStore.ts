import { create } from "zustand";
import type { GeometryHandle, ImageHandle } from "../core/assets/types";

export interface AssetState {
  meshes: Record<string, GeometryHandle>;
  images: Record<string, ImageHandle>;
  rev: number;

  addMesh: (handle: GeometryHandle) => void;
  addImage: (handle: ImageHandle) => void;
  removeMesh: (id: string) => void;
  removeImage: (id: string) => void;
}

export const useAssetStore = create<AssetState>((set) => ({
  meshes: {},
  images: {},
  rev: 0,
  addMesh: (handle) =>
    set((s) => ({
      meshes: { ...s.meshes, [handle.id]: handle },
      rev: s.rev + 1,
    })),
  addImage: (handle) =>
    set((s) => ({
      images: { ...s.images, [handle.id]: handle },
      rev: s.rev + 1,
    })),
  removeMesh: (id) =>
    set((s) => {
      const meshes = { ...s.meshes };
      delete meshes[id];
      return { meshes, rev: s.rev + 1 };
    }),
  removeImage: (id) =>
    set((s) => {
      const images = { ...s.images };
      delete images[id];
      return { images, rev: s.rev + 1 };
    }),
}));

export function snapshotAssets() {
  const s = useAssetStore.getState();
  return { meshes: s.meshes, images: s.images };
}
