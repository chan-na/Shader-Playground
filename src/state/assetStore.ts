import { create } from "zustand";
import type {
  AudioAssetHandle,
  GeometryHandle,
  ImageHandle,
  VideoAssetHandle,
} from "../core/assets/types";

export interface AssetState {
  meshes: Record<string, GeometryHandle>;
  images: Record<string, ImageHandle>;
  videos: Record<string, VideoAssetHandle>;
  audios: Record<string, AudioAssetHandle>;
  /** Decoded Blob payloads kept in memory alongside the video metadata so
   *  the external registry can resolve assetId → Blob synchronously. */
  videoBlobs: Record<string, Blob>;
  audioBlobs: Record<string, Blob>;
  rev: number;

  addMesh: (handle: GeometryHandle) => void;
  addImage: (handle: ImageHandle) => void;
  addVideo: (handle: VideoAssetHandle, blob: Blob) => void;
  addAudio: (handle: AudioAssetHandle, blob: Blob) => void;
  removeMesh: (id: string) => void;
  removeImage: (id: string) => void;
  removeVideo: (id: string) => void;
  removeAudio: (id: string) => void;
}

export const useAssetStore = create<AssetState>((set) => ({
  meshes: {},
  images: {},
  videos: {},
  audios: {},
  videoBlobs: {},
  audioBlobs: {},
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
  addVideo: (handle, blob) =>
    set((s) => ({
      videos: { ...s.videos, [handle.id]: handle },
      videoBlobs: { ...s.videoBlobs, [handle.id]: blob },
      rev: s.rev + 1,
    })),
  addAudio: (handle, blob) =>
    set((s) => ({
      audios: { ...s.audios, [handle.id]: handle },
      audioBlobs: { ...s.audioBlobs, [handle.id]: blob },
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
  removeVideo: (id) =>
    set((s) => {
      const videos = { ...s.videos };
      delete videos[id];
      const videoBlobs = { ...s.videoBlobs };
      delete videoBlobs[id];
      return { videos, videoBlobs, rev: s.rev + 1 };
    }),
  removeAudio: (id) =>
    set((s) => {
      const audios = { ...s.audios };
      delete audios[id];
      const audioBlobs = { ...s.audioBlobs };
      delete audioBlobs[id];
      return { audios, audioBlobs, rev: s.rev + 1 };
    }),
}));

export function snapshotAssets() {
  const s = useAssetStore.getState();
  return {
    meshes: s.meshes,
    images: s.images,
    videos: s.videos,
    audios: s.audios,
  };
}

/** Synchronous lookup used by the external video texture registry. */
export function getVideoBlob(assetId: string): Blob | null {
  return useAssetStore.getState().videoBlobs[assetId] ?? null;
}

/** Synchronous lookup used by the external audio FFT registry. */
export function getAudioBlob(assetId: string): Blob | null {
  return useAssetStore.getState().audioBlobs[assetId] ?? null;
}
