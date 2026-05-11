import type { GeometryHandle, ImageHandle } from './types';
import type { MeshData, MeshAttribute } from '../gl/mesh';

const DB_NAME = 'shader-playground';
const DB_VERSION = 1;
const STORE_MESH = 'meshes';
const STORE_IMAGE = 'images';

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

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MESH)) db.createObjectStore(STORE_MESH, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_IMAGE)) db.createObjectStore(STORE_IMAGE, { keyPath: 'id' });
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
  return {
    id: handle.id,
    name: handle.name,
    vertexCount: handle.data.vertexCount,
    attributes: handle.data.attributes.map((a) => ({
      name: a.name,
      data: a.data.buffer.slice(a.data.byteOffset, a.data.byteOffset + a.data.byteLength),
      size: a.size,
    })),
    indices: handle.data.indices
      ? {
          buffer: handle.data.indices.buffer.slice(
            handle.data.indices.byteOffset,
            handle.data.indices.byteOffset + handle.data.indices.byteLength,
          ) as ArrayBuffer,
          bytesPerIndex: handle.data.indices instanceof Uint32Array ? 4 : 2,
        }
      : undefined,
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
  await awaitRequest(tx(db, STORE_MESH, 'readwrite').put(serializeMesh(handle)));
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
  await awaitRequest(tx(db, STORE_IMAGE, 'readwrite').put(record));
}

export async function loadCachedMesh(id: string): Promise<GeometryHandle | null> {
  try {
    const db = await openDb();
    const record = await awaitRequest<SerializedMesh | undefined>(
      tx(db, STORE_MESH, 'readonly').get(id),
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
      tx(db, STORE_IMAGE, 'readonly').get(id),
    );
    if (!record) return null;
    const bitmap = await createImageBitmap(record.blob, { premultiplyAlpha: 'none' });
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

export async function listCachedIds(): Promise<{ meshes: string[]; images: string[] }> {
  const db = await openDb();
  const meshes = (await awaitRequest<IDBValidKey[]>(
    tx(db, STORE_MESH, 'readonly').getAllKeys(),
  )) as string[];
  const images = (await awaitRequest<IDBValidKey[]>(
    tx(db, STORE_IMAGE, 'readonly').getAllKeys(),
  )) as string[];
  return { meshes, images };
}

export async function clearCache(): Promise<void> {
  const db = await openDb();
  await awaitRequest(tx(db, STORE_MESH, 'readwrite').clear());
  await awaitRequest(tx(db, STORE_IMAGE, 'readwrite').clear());
}
