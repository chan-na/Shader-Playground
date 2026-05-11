import type { MeshData } from '../gl/mesh';

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
