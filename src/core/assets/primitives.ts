// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + bounded geometry generation loops
import type { MeshData } from "../gl/mesh";

export function makeQuad(): MeshData {
  // Fullscreen NDC quad, used for post passes
  const positions = new Float32Array([
    -1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0,
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
  return {
    attributes: [
      { name: "a_position", data: positions, size: 3 },
      { name: "a_normal", data: normals, size: 3 },
      { name: "a_uv", data: uvs, size: 2 },
    ],
    vertexCount: 6,
  };
}

export function makePlane(size = 1): MeshData {
  const s = size;
  const positions = new Float32Array([
    -s,
    0,
    -s,
    s,
    0,
    -s,
    -s,
    0,
    s,
    -s,
    0,
    s,
    s,
    0,
    -s,
    s,
    0,
    s,
  ]);
  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
  return {
    attributes: [
      { name: "a_position", data: positions, size: 3 },
      { name: "a_normal", data: normals, size: 3 },
      { name: "a_uv", data: uvs, size: 2 },
    ],
    vertexCount: 6,
  };
}

export function makeCube(size = 1): MeshData {
  const s = size;
  const faces: Array<{ p: number[][]; n: number[]; u: number[][] }> = [
    // +X
    {
      p: [
        [s, -s, -s],
        [s, s, -s],
        [s, -s, s],
        [s, s, -s],
        [s, s, s],
        [s, -s, s],
      ],
      n: [1, 0, 0],
      u: [
        [0, 0],
        [0, 1],
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ],
    },
    // -X
    {
      p: [
        [-s, -s, s],
        [-s, s, s],
        [-s, -s, -s],
        [-s, s, s],
        [-s, s, -s],
        [-s, -s, -s],
      ],
      n: [-1, 0, 0],
      u: [
        [0, 0],
        [0, 1],
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ],
    },
    // +Y
    {
      p: [
        [-s, s, s],
        [s, s, s],
        [-s, s, -s],
        [s, s, s],
        [s, s, -s],
        [-s, s, -s],
      ],
      n: [0, 1, 0],
      u: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
    // -Y
    {
      p: [
        [-s, -s, -s],
        [s, -s, -s],
        [-s, -s, s],
        [s, -s, -s],
        [s, -s, s],
        [-s, -s, s],
      ],
      n: [0, -1, 0],
      u: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
    // +Z
    {
      p: [
        [-s, -s, s],
        [s, -s, s],
        [-s, s, s],
        [s, -s, s],
        [s, s, s],
        [-s, s, s],
      ],
      n: [0, 0, 1],
      u: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
    // -Z
    {
      p: [
        [s, -s, -s],
        [-s, -s, -s],
        [s, s, -s],
        [-s, -s, -s],
        [-s, s, -s],
        [s, s, -s],
      ],
      n: [0, 0, -1],
      u: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const f of faces) {
    for (let i = 0; i < 6; i++) {
      const p = f.p[i]!;
      const u = f.u[i]!;
      positions.push(p[0]!, p[1]!, p[2]!);
      normals.push(f.n[0]!, f.n[1]!, f.n[2]!);
      uvs.push(u[0]!, u[1]!);
    }
  }
  return {
    attributes: [
      { name: "a_position", data: new Float32Array(positions), size: 3 },
      { name: "a_normal", data: new Float32Array(normals), size: 3 },
      { name: "a_uv", data: new Float32Array(uvs), size: 2 },
    ],
    vertexCount: positions.length / 3,
  };
}

export function makeSphere(radius = 1, segments = 32, rings = 16): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const phi = v * Math.PI;
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const theta = u * Math.PI * 2;
      const sx = Math.cos(theta) * Math.sin(phi);
      const sy = Math.cos(phi);
      const sz = Math.sin(theta) * Math.sin(phi);
      positions.push(sx * radius, sy * radius, sz * radius);
      normals.push(sx, sy, sz);
      uvs.push(u, 1 - v);
    }
  }

  const stride = segments + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    attributes: [
      { name: "a_position", data: new Float32Array(positions), size: 3 },
      { name: "a_normal", data: new Float32Array(normals), size: 3 },
      { name: "a_uv", data: new Float32Array(uvs), size: 2 },
    ],
    indices: new Uint16Array(indices),
    vertexCount: positions.length / 3,
  };
}

export function makeTorus(
  radius = 1,
  tube = 0.35,
  radialSegments = 32,
  tubularSegments = 48,
): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= radialSegments; j++) {
    const v = j / radialSegments;
    const phi = v * Math.PI * 2;
    for (let i = 0; i <= tubularSegments; i++) {
      const u = i / tubularSegments;
      const theta = u * Math.PI * 2;
      const cx = (radius + tube * Math.cos(phi)) * Math.cos(theta);
      const cy = tube * Math.sin(phi);
      const cz = (radius + tube * Math.cos(phi)) * Math.sin(theta);
      positions.push(cx, cy, cz);
      const nx = Math.cos(phi) * Math.cos(theta);
      const ny = Math.sin(phi);
      const nz = Math.cos(phi) * Math.sin(theta);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  const stride = tubularSegments + 1;
  for (let j = 0; j < radialSegments; j++) {
    for (let i = 0; i < tubularSegments; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    attributes: [
      { name: "a_position", data: new Float32Array(positions), size: 3 },
      { name: "a_normal", data: new Float32Array(normals), size: 3 },
      { name: "a_uv", data: new Float32Array(uvs), size: 2 },
    ],
    indices: new Uint16Array(indices),
    vertexCount: positions.length / 3,
  };
}

export const PRIMITIVE_NAMES = [
  "cube",
  "sphere",
  "plane",
  "torus",
  "quad",
] as const;
export type PrimitiveName = (typeof PRIMITIVE_NAMES)[number];

export function makePrimitive(name: PrimitiveName) {
  switch (name) {
    case "cube":
      return makeCube();
    case "sphere":
      return makeSphere();
    case "plane":
      return makePlane();
    case "torus":
      return makeTorus();
    case "quad":
      return makeQuad();
  }
}
