import type { MeshData } from "../gl/mesh";

export interface GeometryHandle {
  id: string;
  name: string;
  data: MeshData;
}

export interface ImageHandle {
  id: string;
  name: string;
  width: number;
  height: number;
  bitmap: ImageBitmap | HTMLImageElement | null;
}

export interface VideoAssetHandle {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Duration in seconds; 0 when the file failed to probe metadata. */
  duration: number;
  /** MIME type as reported by the source File; falls back to "video/mp4". */
  mimeType: string;
}

export interface AudioAssetHandle {
  id: string;
  name: string;
  /** Duration in seconds; 0 when probe failed. */
  duration: number;
  /** Sample rate as decoded; 0 when probe failed. */
  sampleRate: number;
  /** Channel count as decoded; 0 when probe failed. */
  channels: number;
  /** MIME type as reported by the source File; falls back to "audio/mpeg". */
  mimeType: string;
}
