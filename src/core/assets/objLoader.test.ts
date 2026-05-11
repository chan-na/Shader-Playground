import { describe, expect, it } from "vitest";
import { loadObjFromText, toGeometryHandle } from "./objLoader";

const TRI_OBJ = `
# minimal triangle
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
vn 0.0 0.0 1.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.0 1.0
f 1/1/1 2/2/1 3/3/1
`;

describe("loadObjFromText", () => {
  it("parses a minimal OBJ triangle into MeshData", async () => {
    const handle = await loadObjFromText(TRI_OBJ, "tri.obj");
    expect(handle.name).toBe("tri.obj");
    expect(
      handle.data.attributes.find((a) => a.name === "a_position"),
    ).toBeDefined();
    expect(
      handle.data.attributes.find((a) => a.name === "a_normal"),
    ).toBeDefined();
    expect(handle.data.attributes.find((a) => a.name === "a_uv")).toBeDefined();
    expect(handle.data.vertexCount).toBeGreaterThanOrEqual(3);
  });

  it("assigns a non-empty id", async () => {
    const a = await loadObjFromText(TRI_OBJ);
    const b = await loadObjFromText(TRI_OBJ);
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});

describe("toGeometryHandle", () => {
  it("synthesizes flat normals when the input lacks NORMAL", () => {
    // Single CCW triangle on the XY plane, expected normal: (0, 0, 1)
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const handle = toGeometryHandle(
      { attributes: { POSITION: { value: positions } } },
      "flat",
    );
    const normalAttr = handle.data.attributes.find(
      (a) => a.name === "a_normal",
    );
    expect(normalAttr).toBeDefined();
    const n = normalAttr!.data;
    // Each of the three vertices receives the same flat normal.
    for (let i = 0; i < 3; i++) {
      expect(n[i * 3]).toBeCloseTo(0);
      expect(n[i * 3 + 1]).toBeCloseTo(0);
      expect(n[i * 3 + 2]).toBeCloseTo(1);
    }
  });

  it("synthesizes zero UVs when the input lacks TEXCOORD", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const handle = toGeometryHandle(
      { attributes: { POSITION: { value: positions } } },
      "no-uv",
    );
    const uv = handle.data.attributes.find((a) => a.name === "a_uv");
    expect(uv).toBeDefined();
    expect(uv!.data.length).toBe(6);
  });

  it("throws when POSITION is missing", () => {
    expect(() => toGeometryHandle({ attributes: {} }, "bad")).toThrow();
  });
});
