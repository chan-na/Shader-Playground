import type { MeshData } from "../gl/mesh";
import { glPrimitiveLabel } from "../gl/primitiveLabel";
import type { MeshGraphNode } from "../graph/types";
import { makePrimitive } from "./primitives";
import type { GeometryHandle } from "./types";

/**
 * [B-1] Static description of a mesh's vertex-attribute contract — the exact
 * shape every loader in this app produces (`primitives.ts`'s five generators
 * and `objLoader.ts:76-82`'s OBJ→GeometryHandle conversion all emit
 * `a_position(3)·a_normal(3)·a_uv(2)`; glTF is normalized to the same shape
 * by `gltfLoader.ts` reusing `toGeometryHandle`). Surfaced so the `mesh` port
 * stops being an opaque type name and shows what actually flows through it.
 */
export interface MeshContract {
  attributes: Array<{ name: string; size: number }>;
  vertexCount: number;
  indexCount: number;
  primitiveLabel: string;
  source: "primitive" | "asset";
}

function contractFromData(
  data: MeshData,
  source: MeshContract["source"],
): MeshContract {
  return {
    attributes: data.attributes.map((a) => ({ name: a.name, size: a.size })),
    vertexCount: data.vertexCount,
    // gl.TRIANGLES (4) is uploadMesh's own fallback (core/gl/mesh.ts:70) when
    // MeshData.primitive is unset — every built-in primitive and loader
    // leaves it unset, so this stays in sync with what actually draws.
    indexCount: data.indices?.length ?? 0,
    primitiveLabel: glPrimitiveLabel(data.primitive ?? 4),
    source,
  };
}

/**
 * Resolve a mesh node's attribute contract. When an asset is bound, reads
 * straight off its already-loaded `GeometryHandle` (no recomputation);
 * otherwise derives it from `makePrimitive`, the same generator the render
 * path calls, so this can never drift from what's actually uploaded to the
 * GPU. `makePrimitive` allocates full vertex buffers — callers on a render
 * path should memoize (e.g. `useMemo` keyed on `node.primitive`/`assetId`).
 */
export function meshContractFor(
  node: MeshGraphNode,
  asset: GeometryHandle | undefined,
): MeshContract {
  if (asset) return contractFromData(asset.data, "asset");
  return contractFromData(makePrimitive(node.primitive), "primitive");
}

/**
 * Human label for an attribute's component count, matching the GLSL vector
 * type name a shader would declare for it (`a_position`'s size 3 → "vec3").
 * Every primitive/OBJ/glTF attribute in this app is size 2 or 3, but this
 * stays total (falls back to `vecN`) rather than partial for any stray size.
 */
export function attrTypeLabel(size: number): string {
  switch (size) {
    case 1:
      return "float";
    case 2:
      return "vec2";
    case 3:
      return "vec3";
    case 4:
      return "vec4";
    default:
      return `vec${size}`;
  }
}
