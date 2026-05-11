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

async function loadGltfFromArrayBuffer(
  buffer: ArrayBuffer,
  name = "gltf",
): Promise<GeometryHandle> {
  const parsed = (await parse(buffer, GLTFLoader)) as unknown as GLTFParsed;
  const first = parsed.meshes?.[0]?.primitives?.[0];
  if (!first) throw new Error("GLTF has no mesh primitives");
  const attrs = first.attributes;
  const posValue = attrs.POSITION?.value;
  const normValue = attrs.NORMAL?.value;
  const uvValue = attrs.TEXCOORD_0?.value;
  const indValue = first.indices?.value;
  // toGeometryHandle expects { attributes, indices } shape with `.value`.
  const reshape = {
    attributes: {
      ...(posValue && { POSITION: { value: posValue } }),
      ...(normValue && { NORMAL: { value: normValue } }),
      ...(uvValue && { TEXCOORD_0: { value: uvValue } }),
    },
    ...(indValue && { indices: { value: indValue } }),
  };
  const meshName = parsed.json.meshes?.[0]?.name ?? name;
  return toGeometryHandle(reshape, meshName);
}

export async function loadGltfFromFile(file: File): Promise<GeometryHandle> {
  const buf = await file.arrayBuffer();
  return loadGltfFromArrayBuffer(buf, file.name);
}
