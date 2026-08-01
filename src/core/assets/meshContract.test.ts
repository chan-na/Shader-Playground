import { describe, expect, it } from "vitest";
import type { MeshData } from "../gl/mesh";
import type { MeshGraphNode } from "../graph/types";
import { attrTypeLabel, meshContractFor } from "./meshContract";
import { PRIMITIVE_NAMES } from "./primitives";
import type { GeometryHandle } from "./types";

function meshNode(primitive: MeshGraphNode["primitive"]): MeshGraphNode {
  return { id: "m1", kind: "mesh", primitive, assetId: null };
}

describe("meshContractFor — built-in primitives", () => {
  it.each(
    PRIMITIVE_NAMES,
  )("reports the fixed a_position(3)/a_normal(3)/a_uv(2) contract for %s", (primitive) => {
    const contract = meshContractFor(meshNode(primitive), undefined);
    expect(contract.source).toBe("primitive");
    expect(contract.attributes).toEqual([
      { name: "a_position", size: 3 },
      { name: "a_normal", size: 3 },
      { name: "a_uv", size: 2 },
    ]);
    expect(contract.vertexCount).toBeGreaterThan(0);
    expect(contract.primitiveLabel).toBe("TRIANGLES");
  });

  it("reports 0 indexCount for quad/plane/cube (drawArrays, no index buffer)", () => {
    for (const primitive of ["quad", "plane", "cube"] as const) {
      expect(meshContractFor(meshNode(primitive), undefined).indexCount).toBe(
        0,
      );
    }
  });

  it("reports a nonzero indexCount for sphere/torus (drawElements)", () => {
    for (const primitive of ["sphere", "torus"] as const) {
      expect(
        meshContractFor(meshNode(primitive), undefined).indexCount,
      ).toBeGreaterThan(0);
    }
  });
});

describe("meshContractFor — asset path", () => {
  function fakeAsset(data: Partial<MeshData> = {}): GeometryHandle {
    const base: MeshData = {
      attributes: [
        { name: "a_position", data: new Float32Array(9), size: 3 },
        { name: "a_normal", data: new Float32Array(9), size: 3 },
        { name: "a_uv", data: new Float32Array(6), size: 2 },
      ],
      vertexCount: 3,
      ...data,
    };
    return { id: "a1", name: "imported.obj", data: base };
  }

  it("reads attributes/vertexCount straight off the GeometryHandle", () => {
    const contract = meshContractFor(meshNode("cube"), fakeAsset());
    expect(contract.source).toBe("asset");
    expect(contract.attributes).toEqual([
      { name: "a_position", size: 3 },
      { name: "a_normal", size: 3 },
      { name: "a_uv", size: 2 },
    ]);
    expect(contract.vertexCount).toBe(3);
  });

  it("reports indexCount 0 when the asset has no index buffer", () => {
    const contract = meshContractFor(meshNode("cube"), fakeAsset());
    expect(contract.indexCount).toBe(0);
    expect(contract.primitiveLabel).toBe("TRIANGLES");
  });

  it("reports indexCount from the asset's index buffer when present", () => {
    const contract = meshContractFor(
      meshNode("cube"),
      fakeAsset({ indices: new Uint16Array([0, 1, 2, 0, 2, 3]) }),
    );
    expect(contract.indexCount).toBe(6);
  });

  it("labels a non-default draw primitive via glPrimitiveLabel", () => {
    const contract = meshContractFor(
      meshNode("cube"),
      fakeAsset({ primitive: 0 }), // gl.POINTS
    );
    expect(contract.primitiveLabel).toBe("POINTS");
  });
});

describe("attrTypeLabel", () => {
  it("maps the four standard attribute sizes to GLSL vector type names", () => {
    expect(attrTypeLabel(1)).toBe("float");
    expect(attrTypeLabel(2)).toBe("vec2");
    expect(attrTypeLabel(3)).toBe("vec3");
    expect(attrTypeLabel(4)).toBe("vec4");
  });

  it("falls back to vecN for an unexpected size", () => {
    expect(attrTypeLabel(9)).toBe("vec9");
  });
});
