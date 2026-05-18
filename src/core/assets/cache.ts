import type { MeshAttribute, MeshData } from "../gl/mesh";
import type {
  AudioAssetHandle,
  GeometryHandle,
  ImageHandle,
  VideoAssetHandle,
} from "./types";

const DB_NAME = "shader-playground";
// v3: added the audios store. onupgradeneeded only creates stores it doesn't
// yet have, so existing v1/v2 databases keep their meshes / images / videos.
const DB_VERSION = 3;
const STORE_MESH = "meshes";
const STORE_IMAGE = "images";
const STORE_VIDEO = "videos";
const STORE_AUDIO = "audios";

interface SerializedAttribute {
  name: string;
  data: ArrayBuffer;
  size: number;
}

interface SerializedMesh {
  id: string;
  name: string;
  attributes: SerializedAttribute[];
  indices?: { buffer: ArrayBuffer; bytesPerIndex: 2 | 4 };
  vertexCount: number;
}

interface SerializedImage {
  id: string;
  name: string;
  width: number;
  height: number;
  blob: Blob;
}

interface SerializedVideo {
  id: string;
  name: string;
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  blob: Blob;
}

interface SerializedAudio {
  id: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  mimeType: string;
  blob: Blob;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MESH))
        db.createObjectStore(STORE_MESH, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_IMAGE))
        db.createObjectStore(STORE_IMAGE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_VIDEO))
        db.createObjectStore(STORE_VIDEO, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_AUDIO))
        db.createObjectStore(STORE_AUDIO, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode) {
  return db.transaction(store, mode).objectStore(store);
}

function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

function serializeMesh(handle: GeometryHandle): SerializedMesh {
  const { indices } = handle.data;
  return {
    id: handle.id,
    name: handle.name,
    vertexCount: handle.data.vertexCount,
    attributes: handle.data.attributes.map((a) => ({
      name: a.name,
      data: a.data.buffer.slice(
        a.data.byteOffset,
        a.data.byteOffset + a.data.byteLength,
      ),
      size: a.size,
    })),
    ...(indices && {
      indices: {
        buffer: indices.buffer.slice(
          indices.byteOffset,
          indices.byteOffset + indices.byteLength,
        ) as ArrayBuffer,
        bytesPerIndex: (indices instanceof Uint32Array ? 4 : 2) as 2 | 4,
      },
    }),
  };
}

function deserializeMesh(record: SerializedMesh): GeometryHandle {
  const attributes: MeshAttribute[] = record.attributes.map((a) => ({
    name: a.name,
    data: new Float32Array(a.data),
    size: a.size,
  }));
  const data: MeshData = {
    attributes,
    vertexCount: record.vertexCount,
  };
  if (record.indices) {
    data.indices =
      record.indices.bytesPerIndex === 4
        ? new Uint32Array(record.indices.buffer)
        : new Uint16Array(record.indices.buffer);
  }
  return { id: record.id, name: record.name, data };
}

export async function cacheMesh(handle: GeometryHandle): Promise<void> {
  const db = await openDb();
  await awaitRequest(
    tx(db, STORE_MESH, "readwrite").put(serializeMesh(handle)),
  );
}

export async function cacheImage(
  handle: ImageHandle,
  blob: Blob,
): Promise<void> {
  const db = await openDb();
  const record: SerializedImage = {
    id: handle.id,
    name: handle.name,
    width: handle.width,
    height: handle.height,
    blob,
  };
  await awaitRequest(tx(db, STORE_IMAGE, "readwrite").put(record));
}

export async function loadCachedMesh(
  id: string,
): Promise<GeometryHandle | null> {
  try {
    const db = await openDb();
    const record = await awaitRequest<SerializedMesh | undefined>(
      tx(db, STORE_MESH, "readonly").get(id),
    );
    return record ? deserializeMesh(record) : null;
  } catch {
    return null;
  }
}

export async function loadCachedImage(id: string): Promise<{
  handle: ImageHandle;
  blob: Blob;
} | null> {
  try {
    const db = await openDb();
    const record = await awaitRequest<SerializedImage | undefined>(
      tx(db, STORE_IMAGE, "readonly").get(id),
    );
    if (!record) return null;
    const bitmap = await createImageBitmap(record.blob, {
      premultiplyAlpha: "none",
    });
    const handle: ImageHandle = {
      id: record.id,
      name: record.name,
      width: record.width,
      height: record.height,
      bitmap,
    };
    return { handle, blob: record.blob };
  } catch {
    return null;
  }
}

export async function deleteCachedMesh(id: string): Promise<void> {
  try {
    const db = await openDb();
    await awaitRequest(tx(db, STORE_MESH, "readwrite").delete(id));
  } catch {
    // Swallow — caller already removed the in-memory entry; an orphan IDB
    // record will be overwritten or eventually cleared by quota pressure.
  }
}

export async function deleteCachedImage(id: string): Promise<void> {
  try {
    const db = await openDb();
    await awaitRequest(tx(db, STORE_IMAGE, "readwrite").delete(id));
  } catch {
    // See deleteCachedMesh.
  }
}

export async function cacheVideo(
  handle: VideoAssetHandle,
  blob: Blob,
): Promise<void> {
  const db = await openDb();
  const record: SerializedVideo = {
    id: handle.id,
    name: handle.name,
    width: handle.width,
    height: handle.height,
    duration: handle.duration,
    mimeType: handle.mimeType,
    blob,
  };
  await awaitRequest(tx(db, STORE_VIDEO, "readwrite").put(record));
}

export async function loadCachedVideo(id: string): Promise<{
  handle: VideoAssetHandle;
  blob: Blob;
} | null> {
  try {
    const db = await openDb();
    const record = await awaitRequest<SerializedVideo | undefined>(
      tx(db, STORE_VIDEO, "readonly").get(id),
    );
    if (!record) return null;
    const handle: VideoAssetHandle = {
      id: record.id,
      name: record.name,
      width: record.width,
      height: record.height,
      duration: record.duration,
      mimeType: record.mimeType,
    };
    return { handle, blob: record.blob };
  } catch {
    return null;
  }
}

export async function deleteCachedVideo(id: string): Promise<void> {
  try {
    const db = await openDb();
    await awaitRequest(tx(db, STORE_VIDEO, "readwrite").delete(id));
  } catch {
    // See deleteCachedMesh.
  }
}

export async function cacheAudio(
  handle: AudioAssetHandle,
  blob: Blob,
): Promise<void> {
  const db = await openDb();
  const record: SerializedAudio = {
    id: handle.id,
    name: handle.name,
    duration: handle.duration,
    sampleRate: handle.sampleRate,
    channels: handle.channels,
    mimeType: handle.mimeType,
    blob,
  };
  await awaitRequest(tx(db, STORE_AUDIO, "readwrite").put(record));
}

export async function loadCachedAudio(id: string): Promise<{
  handle: AudioAssetHandle;
  blob: Blob;
} | null> {
  try {
    const db = await openDb();
    const record = await awaitRequest<SerializedAudio | undefined>(
      tx(db, STORE_AUDIO, "readonly").get(id),
    );
    if (!record) return null;
    const handle: AudioAssetHandle = {
      id: record.id,
      name: record.name,
      duration: record.duration,
      sampleRate: record.sampleRate,
      channels: record.channels,
      mimeType: record.mimeType,
    };
    return { handle, blob: record.blob };
  } catch {
    return null;
  }
}

export async function deleteCachedAudio(id: string): Promise<void> {
  try {
    const db = await openDb();
    await awaitRequest(tx(db, STORE_AUDIO, "readwrite").delete(id));
  } catch {
    // See deleteCachedMesh.
  }
}
