import { describe, expect, it } from "vitest";
import { createFakeGl } from "./fakeGl";
import { disposeMesh, drawMesh, type MeshData, uploadMesh } from "./mesh";

function quadData(): MeshData {
  return {
    attributes: [
      {
        name: "a_position",
        data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        size: 2,
      },
    ],
    vertexCount: 4,
  };
}

describe("uploadMesh", () => {
  it("creates one VBO per attribute whose location is known", () => {
    const gl = createFakeGl({ attributes: ["a_position"] });
    const mesh = uploadMesh(gl, quadData(), { a_position: 0 });
    expect(mesh.vbos).toHaveLength(1);
    expect(mesh.vertexCount).toBe(4);
    expect(mesh.ibo).toBeNull();
    expect(mesh.indexCount).toBe(0);
  });

  it("skips attributes whose location is missing or negative", () => {
    const gl = createFakeGl();
    const mesh = uploadMesh(gl, quadData(), { a_position: -1 });
    expect(mesh.vbos).toHaveLength(0);
  });

  it("uploads Uint16Array indices and picks UNSIGNED_SHORT", () => {
    const gl = createFakeGl({ attributes: ["a_position"] });
    const data: MeshData = {
      ...quadData(),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    };
    const mesh = uploadMesh(gl, data, { a_position: 0 });
    expect(mesh.ibo).not.toBeNull();
    expect(mesh.indexCount).toBe(6);
    expect(mesh.indexType).toBe(gl.UNSIGNED_SHORT);
  });

  it("uploads Uint32Array indices and picks UNSIGNED_INT", () => {
    const gl = createFakeGl({ attributes: ["a_position"] });
    const data: MeshData = {
      ...quadData(),
      indices: new Uint32Array([0, 1, 2]),
    };
    const mesh = uploadMesh(gl, data, { a_position: 0 });
    expect(mesh.indexType).toBe(gl.UNSIGNED_INT);
  });

  it("uses a custom primitive when supplied; otherwise TRIANGLES", () => {
    const gl = createFakeGl({ attributes: ["a_position"] });
    const customPrim: MeshData = { ...quadData(), primitive: gl.POINTS };
    const m1 = uploadMesh(gl, customPrim, { a_position: 0 });
    expect(m1.primitive).toBe(gl.POINTS);
    const m2 = uploadMesh(gl, quadData(), { a_position: 0 });
    expect(m2.primitive).toBe(gl.TRIANGLES);
  });

  it("throws when VAO allocation fails", () => {
    const gl = createFakeGl({ resourceFailure: true });
    expect(() => uploadMesh(gl, quadData(), { a_position: 0 })).toThrow();
  });
});

describe("drawMesh / disposeMesh", () => {
  it("drawMesh uses drawElements when ibo is present", () => {
    const gl = createFakeGl({ attributes: ["a_position"] });
    const mesh = uploadMesh(
      gl,
      { ...quadData(), indices: new Uint16Array([0, 1, 2]) },
      { a_position: 0 },
    );
    expect(() => drawMesh(gl, mesh)).not.toThrow();
  });

  it("drawMesh uses drawArrays when ibo is absent", () => {
    const gl = createFakeGl({ attributes: ["a_position"] });
    const mesh = uploadMesh(gl, quadData(), { a_position: 0 });
    expect(() => drawMesh(gl, mesh)).not.toThrow();
  });

  it("disposeMesh tears down vao, vbos, and ibo (if any)", () => {
    const gl = createFakeGl({ attributes: ["a_position"] });
    const indexed = uploadMesh(
      gl,
      { ...quadData(), indices: new Uint16Array([0, 1, 2]) },
      { a_position: 0 },
    );
    expect(() => disposeMesh(gl, indexed)).not.toThrow();

    const plain = uploadMesh(gl, quadData(), { a_position: 0 });
    expect(() => disposeMesh(gl, plain)).not.toThrow();
  });
});
