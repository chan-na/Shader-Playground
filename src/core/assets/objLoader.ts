import { parse } from "@loaders.gl/core";
import { OBJLoader } from "@loaders.gl/obj";
import type { MeshData } from "../gl/mesh";
import type { GeometryHandle } from "./types";

function pickAttribute(
  attrs: Record<
    string,
    { value: ArrayLike<number>; size?: number } | undefined
  >,
  keys: string[],
) {
  for (const k of keys) {
    const a = attrs[k];
    if (a && a.value) return a;
  }
  return undefined;
}

export async function loadObjFromText(
  text: string,
  name = "obj",
): Promise<GeometryHandle> {
  const parsed = (await parse(text, OBJLoader)) as {
    attributes: Record<string, { value: ArrayLike<number>; size?: number }>;
    indices?: { value: ArrayLike<number> };
  };
  return toGeometryHandle(parsed, name);
}

export async function loadObjFromFile(file: File): Promise<GeometryHandle> {
  const text = await file.text();
  return loadObjFromText(text, file.name);
}

export function toGeometryHandle(
  parsed: {
    attributes: Record<
      string,
      { value: ArrayLike<number>; size?: number } | undefined
    >;
    indices?: { value: ArrayLike<number> };
  },
  name: string,
): GeometryHandle {
  const pos = pickAttribute(parsed.attributes, [
    "POSITION",
    "positions",
    "position",
  ]);
  if (!pos) {
    throw new Error("OBJ has no POSITION attribute");
  }
  const norm = pickAttribute(parsed.attributes, [
    "NORMAL",
    "normals",
    "normal",
  ]);
  const uv = pickAttribute(parsed.attributes, [
    "TEXCOORD_0",
    "TEXCOORD",
    "uvs",
    "uv",
  ]);

  const positions = new Float32Array(pos.value);
  const vertexCount = positions.length / 3;
  const normals = norm
    ? new Float32Array(norm.value)
    : computeFlatNormals(positions, parsed.indices?.value);
  const uvs = uv
    ? new Float32Array(uv.value)
    : new Float32Array(vertexCount * 2);

  const data: MeshData = {
    attributes: [
      { name: "a_position", data: positions, size: 3 },
      { name: "a_normal", data: normals, size: 3 },
      { name: "a_uv", data: uvs, size: 2 },
    ],
    vertexCount,
  };
  if (parsed.indices?.value) {
    data.indices = toIndexArray(parsed.indices.value, vertexCount);
  }
  return {
    id: cryptoRandomId(),
    name,
    data,
  };
}

function toIndexArray(src: ArrayLike<number>, vertexCount: number) {
  return vertexCount > 65535 ? new Uint32Array(src) : new Uint16Array(src);
}

function computeFlatNormals(
  positions: Float32Array,
  indices?: ArrayLike<number>,
): Float32Array {
  const out = new Float32Array(positions.length);
  const cross = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ): [number, number, number] => {
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = cx - ax,
      vy = cy - ay,
      vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };
  const triCount = indices ? indices.length / 3 : positions.length / 9;
  for (let t = 0; t < triCount; t++) {
    const i0 = indices ? indices[t * 3] : t * 3;
    const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
    const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
    const [ax, ay, az] = [
      positions[i0 * 3],
      positions[i0 * 3 + 1],
      positions[i0 * 3 + 2],
    ];
    const [bx, by, bz] = [
      positions[i1 * 3],
      positions[i1 * 3 + 1],
      positions[i1 * 3 + 2],
    ];
    const [cx, cy, cz] = [
      positions[i2 * 3],
      positions[i2 * 3 + 1],
      positions[i2 * 3 + 2],
    ];
    const [nx, ny, nz] = cross(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (const i of [i0, i1, i2]) {
      out[i * 3] += nx;
      out[i * 3 + 1] += ny;
      out[i * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const len = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= len;
    out[i + 1] /= len;
    out[i + 2] /= len;
  }
  return out;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mesh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
