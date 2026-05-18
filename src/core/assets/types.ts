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
