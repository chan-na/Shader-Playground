import { describe, expect, it, vi } from "vitest";

// Mock @loaders.gl/core so we don't need a real GLB binary. The loader only
// calls `parse(buffer, GLTFLoader)` — return whatever the loader expects.
vi.mock("@loaders.gl/core", () => ({
  parse: vi.fn(),
}));
vi.mock("@loaders.gl/gltf", () => ({
  GLTFLoader: { name: "GLTFLoader" },
}));

import { parse } from "@loaders.gl/core";
import { loadGltfFromFile } from "./gltfLoader";

const mockedParse = vi.mocked(parse);

function makeFile(): File {
  // jsdom's File doesn't implement arrayBuffer(); the loader only needs
  // `.arrayBuffer()` and `.name`, so a minimal stub is enough.
  return {
    name: "model.glb",
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File;
}

describe("loadGltfFromFile", () => {
  it("throws when the parsed gltf has no mesh primitives", async () => {
    mockedParse.mockResolvedValueOnce({
      json: { meshes: [] },
      meshes: [],
    });
    await expect(loadGltfFromFile(makeFile())).rejects.toThrow(
      "GLTF has no mesh primitives",
    );
  });

  it("throws when meshes is undefined", async () => {
    mockedParse.mockResolvedValueOnce({ json: {} });
    await expect(loadGltfFromFile(makeFile())).rejects.toThrow(
      "GLTF has no mesh primitives",
    );
  });

  it("constructs a GeometryHandle from a minimal POSITION-only primitive", async () => {
    mockedParse.mockResolvedValueOnce({
      json: { meshes: [{ name: "cube_named" }] },
      meshes: [
        {
          primitives: [
            {
              attributes: {
                // Two triangles' worth of positions so flat-normal computation
                // has data to chew on.
                POSITION: {
                  componentType: 5126,
                  count: 6,
                  value: new Float32Array([
                    0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
                  ]),
                },
              },
            },
          ],
        },
      ],
    });
    const handle = await loadGltfFromFile(makeFile());
    expect(handle.name).toBe("cube_named");
    expect(handle.data.vertexCount).toBe(6);
    // Normals were generated since NORMAL was absent.
    const normalAttr = handle.data.attributes.find(
      (a) => a.name === "a_normal",
    );
    expect(normalAttr).toBeDefined();
    expect(normalAttr?.data.length).toBe(6 * 3);
  });

  it("passes through NORMAL and TEXCOORD_0 when present, and uses 'gltf' fallback name", async () => {
    mockedParse.mockResolvedValueOnce({
      json: {},
      meshes: [
        {
          primitives: [
            {
              attributes: {
                POSITION: {
                  componentType: 5126,
                  count: 3,
                  value: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                },
                NORMAL: {
                  componentType: 5126,
                  count: 3,
                  value: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
                },
                TEXCOORD_0: {
                  componentType: 5126,
                  count: 3,
                  value: new Float32Array([0, 0, 1, 0, 0, 1]),
                },
              },
              indices: {
                componentType: 5123,
                count: 3,
                value: new Uint16Array([0, 1, 2]),
              },
            },
          ],
        },
      ],
    });
    const handle = await loadGltfFromFile(makeFile());
    // File name fallback: loadGltfFromFile passes file.name in as the fallback,
    // and json.meshes is absent, so the file name wins.
    expect(handle.name).toBe("model.glb");
    expect(handle.data.indices).toBeDefined();
    expect(handle.data.indices?.length).toBe(3);
  });
});
