import type { ImageHandle } from "./types";

async function loadImageFromBlob(
  blob: Blob,
  name = "image",
): Promise<ImageHandle> {
  // Keep the bitmap in its native orientation so canvas drawImage previews
  // look right. GL upload uses UNPACK_FLIP_Y_WEBGL to flip to OpenGL UV.
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: "none",
  });
  return {
    id: cryptoRandomId(),
    name,
    width: bitmap.width,
    height: bitmap.height,
    bitmap,
  };
}

export async function loadImageFromFile(file: File): Promise<ImageHandle> {
  return loadImageFromBlob(file, file.name);
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
