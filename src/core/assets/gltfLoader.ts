import { parse } from "@loaders.gl/core";
import { GLTFLoader } from "@loaders.gl/gltf";
import { toGeometryHandle } from "./objLoader";
import type { GeometryHandle } from "./types";

interface GLTFAccessor {
  componentType: number;
  count: number;
  value?: ArrayLike<number>;
}

interface GLTFPrimitive {
  attributes: {
    POSITION?: GLTFAccessor;
    NORMAL?: GLTFAccessor;
    TEXCOORD_0?: GLTFAccessor;
  };
  indices?: GLTFAccessor;
}

interface GLTFMeshSpec {
  primitives: GLTFPrimitive[];
}

interface GLTFParsed {
  json: { meshes?: Array<{ name?: string }> };
  meshes?: GLTFMeshSpec[];
}

interface MergedGeometry {
  attributes: Record<string, { value: number[] } | undefined>;
  indices: { value: number[] };
}

/**
 * Flatten every primitive of every mesh into a single indexed geometry.
 *
 * glTF commonly splits a model into one primitive per material (a multi-material
 * GLB has N primitives), and a scene into multiple meshes. Reading only the
 * first primitive of the first mesh silently drops the rest. Here each
 * primitive's indices are rebased by the running vertex count and concatenated.
 *
 * NORMAL / TEXCOORD_0 are merged only when *every* contributing primitive has
 * them; otherwise they are omitted so toGeometryHandle falls back to computed
 * flat normals / zero UVs rather than producing misaligned attribute buffers.
 */
function mergeGltfPrimitives(
  meshes: GLTFMeshSpec[] | undefined,
): MergedGeometry {
  const prims: GLTFPrimitive[] = [];
  for (const mesh of meshes ?? []) {
    for (const p of mesh?.primitives ?? []) if (p) prims.push(p);
  }
  if (prims.length === 0) {
    throw new Error("GLTF has no mesh primitives");
  }
  const withPos = prims.filter((p) => p.attributes.POSITION?.value);
  if (withPos.length === 0) {
    throw new Error("glTF primitive has no POSITION attribute");
  }

  const haveNormal = withPos.every((p) => p.attributes.NORMAL?.value);
  const haveUv = withPos.every((p) => p.attributes.TEXCOORD_0?.value);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const p of withPos) {
    const posArr = Array.from(p.attributes.POSITION?.value ?? []);
    const vcount = Math.floor(posArr.length / 3);
    for (const v of posArr) positions.push(v);
    if (haveNormal) {
      for (const v of Array.from(p.attributes.NORMAL?.value ?? [])) {
        normals.push(v);
      }
    }
    if (haveUv) {
      for (const v of Array.from(p.attributes.TEXCOORD_0?.value ?? [])) {
        uvs.push(v);
      }
    }
    const ind = p.indices?.value;
    if (ind) {
      for (const v of Array.from(ind)) indices.push(v + vertexOffset);
    } else {
      for (let i = 0; i < vcount; i++) indices.push(vertexOffset + i);
    }
    vertexOffset += vcount;
  }

  const attributes: Record<string, { value: number[] } | undefined> = {
    POSITION: { value: positions },
  };
  if (haveNormal) attributes.NORMAL = { value: normals };
  if (haveUv) attributes.TEXCOORD_0 = { value: uvs };
  return { attributes, indices: { value: indices } };
}

async function loadGltfFromArrayBuffer(
  buffer: ArrayBuffer,
  name = "gltf",
): Promise<GeometryHandle> {
  const parsed = (await parse(buffer, GLTFLoader)) as unknown as GLTFParsed;
  const merged = mergeGltfPrimitives(parsed.meshes);
  const meshName = parsed.json.meshes?.[0]?.name ?? name;
  return toGeometryHandle(merged, meshName);
}

export async function loadGltfFromFile(file: File): Promise<GeometryHandle> {
  const buf = await file.arrayBuffer();
  return loadGltfFromArrayBuffer(buf, file.name);
}
