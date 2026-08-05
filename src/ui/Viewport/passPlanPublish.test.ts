import { describe, expect, it } from "vitest";
import { makePrimitive } from "../../core/assets/primitives";
import { createFakeGl } from "../../core/gl/fakeGl";
import { compileGraph, emptyPlan } from "../../core/graph/compile";
import type { Graph } from "../../core/graph/types";
import basicVert from "../../shaders/basic.vert?raw";
import type { ComputePassRow, ShaderPassRow } from "../../state/passPlanStore";
import { buildPassRows, buildVaryingContracts } from "./passPlanPublish";

// Attribute set shared by every fake-gl-compiled program in this file: the
// fixed 3-attribute mesh contract (a_position/a_normal/a_uv, see
// core/assets/primitives.ts) plus the compute node's ping-pong slot (a_pos).
// `uniforms: ["u_tex"]` means every fake-compiled program (regardless of its
// actual source text) reflects exactly one active uniform, `u_tex` — used by
// the silentWarnings fixtures below to exercise both the "active but
// unbound" and "declared but not active" branches.
function makeGl() {
  return createFakeGl({
    attributes: ["a_position", "a_normal", "a_uv", "a_pos"],
    uniforms: ["u_tex"],
  });
}

function shaderRow(rows: ReturnType<typeof buildPassRows>, nodeId: string) {
  const row = rows.find((r) => r.nodeId === nodeId);
  if (!row || row.kind !== "shader") {
    throw new Error(`expected a shader row for ${nodeId}`);
  }
  return row as ShaderPassRow;
}

function computeRow(rows: ReturnType<typeof buildPassRows>, nodeId: string) {
  const row = rows.find((r) => r.nodeId === nodeId);
  if (!row || row.kind !== "compute") {
    throw new Error(`expected a compute row for ${nodeId}`);
  }
  return row as ComputePassRow;
}

/**
 * Graph exercising every meshLabel branch plus a compute pass, wired so the
 * topological order differs from the shader-only draw order:
 *   c1(compute) → s4(mesh from c1)
 *   mCube(primitive mesh) → s2
 *   mAsset(asset mesh) → s3
 *   s1 has no mesh input at all (fullscreen substitution).
 */
function buildFixture() {
  const graph: Graph = {
    nodes: [
      {
        id: "c1",
        kind: "compute",
        vertexSource: "//v",
        count: 8,
        primitive: "POINTS",
        attributes: [
          { inName: "a_pos", outName: "v_pos", size: 3, seed: "zero" },
        ],
        uniformValues: {},
      },
      { id: "mCube", kind: "mesh", primitive: "cube" },
      { id: "mAsset", kind: "mesh", primitive: "cube", assetId: "assetA" },
      {
        id: "s1",
        kind: "shader",
        vertexSource: "//v",
        // Declares two uniforms: u_tex is in the fake gl's active-uniform
        // list but has no incoming edge here (sampler-unconnected); u_ghost
        // is declared but never appears in the active list at all
        // (uniform-inactive).
        fragmentSource: `#version 300 es
uniform sampler2D u_tex;
uniform float u_ghost;
out vec4 fragColor;
void main() { fragColor = texture(u_tex, vec2(0.0)); }`,
        uniformValues: {},
      },
      {
        id: "s2",
        kind: "shader",
        vertexSource: "//v",
        fragmentSource: "//f",
        uniformValues: {},
        resolutionScale: 0.5,
      },
      {
        id: "s3",
        kind: "shader",
        vertexSource: "//v",
        // Same u_tex declaration as s1, but this one gets a sampler edge
        // (below) — active AND bound, so it should carry no warning.
        fragmentSource: `#version 300 es
uniform sampler2D u_tex;
out vec4 fragColor;
void main() { fragColor = texture(u_tex, vec2(0.0)); }`,
        uniformValues: {},
      },
      {
        id: "s4",
        kind: "shader",
        vertexSource: "//v",
        fragmentSource: "//f",
        uniformValues: {},
      },
    ],
    edges: [
      {
        id: "e1",
        source: "mCube",
        sourceHandle: "mesh",
        target: "s2",
        targetHandle: "mesh",
      },
      {
        id: "e2",
        source: "mAsset",
        sourceHandle: "mesh",
        target: "s3",
        targetHandle: "mesh",
      },
      {
        id: "e3",
        source: "c1",
        sourceHandle: "out",
        target: "s4",
        targetHandle: "mesh",
      },
      // s1 → s3's u_tex: a non-mesh edge from a "shader"-kind source, so
      // compile.ts classifies it as a sampler binding (not a paramBinding).
      // Also verified not to disturb the topological order below — s1
      // already sorts before s3 without this edge.
      {
        id: "e4",
        source: "s1",
        sourceHandle: "texture",
        target: "s3",
        targetHandle: "u_tex",
      },
    ],
  };
  const assets = {
    meshes: {
      assetA: { id: "assetA", name: "Bunny", data: makePrimitive("sphere") },
    },
    images: {},
  };
  const gl = makeGl();
  const plan = compileGraph(gl, graph, { width: 64, height: 64, assets });
  return { graph, assets, plan };
}

describe("buildPassRows", () => {
  it("preserves plan.passes order (topological, not declaration order)", () => {
    const { graph, assets, plan } = buildFixture();
    // The compiled node array order (c1, mCube, mAsset, s1, s2, s3, s4)
    // differs from the topological pass order once s4's dependency on c1
    // moves it up — this is the order buildPassRows must mirror exactly.
    expect(plan.passes.map((p) => p.nodeId)).toEqual([
      "c1",
      "s1",
      "s4",
      "s2",
      "s3",
    ]);
    const rows = buildPassRows(plan, graph, assets);
    expect(rows.map((r) => r.nodeId)).toEqual(["c1", "s1", "s4", "s2", "s3"]);
    plan.dispose();
  });

  it("labels a mesh-unconnected shader as the fullscreen quad", () => {
    const { graph, assets, plan } = buildFixture();
    const rows = buildPassRows(plan, graph, assets);
    const row = shaderRow(rows, "s1");
    expect(row.meshIsFullscreen).toBe(true);
    expect(row.meshLabel).toBe("fullscreen quad");
    plan.dispose();
  });

  it("labels a primitive-mesh shader with the primitive name", () => {
    const { graph, assets, plan } = buildFixture();
    const rows = buildPassRows(plan, graph, assets);
    const row = shaderRow(rows, "s2");
    expect(row.meshIsFullscreen).toBe(false);
    expect(row.meshLabel).toBe("cube");
    plan.dispose();
  });

  it("labels an asset-mesh shader with the loaded asset's display name", () => {
    const { graph, assets, plan } = buildFixture();
    const rows = buildPassRows(plan, graph, assets);
    const row = shaderRow(rows, "s3");
    expect(row.meshIsFullscreen).toBe(false);
    expect(row.meshLabel).toBe("Bunny");
    plan.dispose();
  });

  it("labels an asset-mesh shader whose handle is absent with the primitive fallback", () => {
    const { graph } = buildFixture();
    // Import still in flight, or the asset dropped from a restored session:
    // with assetA missing from the catalog, compile.ts's meshDataFor falls
    // through to makePrimitive(mn.primitive), so the pass genuinely draws
    // mAsset's cube. Naming the asset here would report the node's intent,
    // not the draw.
    const emptyAssets = { meshes: {}, images: {} };
    const plan = compileGraph(makeGl(), graph, {
      width: 64,
      height: 64,
      assets: emptyAssets,
    });
    const rows = buildPassRows(plan, graph, emptyAssets);
    const row = shaderRow(rows, "s3");
    expect(row.meshIsFullscreen).toBe(false);
    expect(row.meshLabel).toBe("cube (asset not loaded)");
    plan.dispose();
  });

  it("leaves the mesh label empty for a compute-driven shader", () => {
    const { graph, assets, plan } = buildFixture();
    const rows = buildPassRows(plan, graph, assets);
    const row = shaderRow(rows, "s4");
    expect(row.meshIsFullscreen).toBe(false);
    expect(row.meshComputeNodeId).toBe("c1");
    expect(row.meshLabel).toBe("");
    plan.dispose();
  });

  it("reflects resolutionScale in both the row field and the FBO dimensions", () => {
    const { graph, assets, plan } = buildFixture();
    const rows = buildPassRows(plan, graph, assets);
    expect(shaderRow(rows, "s1").resolutionScale).toBe(1);
    const scaled = shaderRow(rows, "s2");
    expect(scaled.resolutionScale).toBe(0.5);
    expect(scaled.width).toBe(32);
    expect(scaled.height).toBe(32);
    plan.dispose();
  });

  it("builds a compute row whose getRead reflects the live pass, even after mutation", () => {
    const { graph, assets, plan } = buildFixture();
    const rows = buildPassRows(plan, graph, assets);
    const row = computeRow(rows, "c1");
    expect(row.primitiveLabel).toBe("POINTS");
    expect(row.count).toBe(8);
    expect(row.getRead()).toBe("A");

    const cp = plan.passes.find((p) => p.nodeId === "c1");
    if (!cp || cp.kind !== "compute") throw new Error("expected compute pass");
    // Mutate the *same* live pass object buildPassRows captured — no
    // re-publish, just like the per-frame ping-pong swap in executePlan.
    cp.read = "B";
    expect(row.getRead()).toBe("B");
    plan.dispose();
  });

  // E-1 (T2): declared-vs-active-vs-bound uniform diffing.
  describe("silentWarnings", () => {
    it("flags an active sampler with no incoming edge as sampler-unconnected, and a never-active uniform as uniform-inactive", () => {
      const { graph, assets, plan } = buildFixture();
      const rows = buildPassRows(plan, graph, assets);
      const row = shaderRow(rows, "s1");
      expect(row.silentWarnings).toEqual([
        { uniformName: "u_tex", kind: "sampler-unconnected" },
        { uniformName: "u_ghost", kind: "uniform-inactive" },
      ]);
      plan.dispose();
    });

    it("carries no warning for a sampler that is both active and bound to an edge", () => {
      const { graph, assets, plan } = buildFixture();
      const rows = buildPassRows(plan, graph, assets);
      const row = shaderRow(rows, "s3");
      expect(row.silentWarnings).toEqual([]);
      plan.dispose();
    });
  });

  // B-2 (T2): mesh-attribute consumption per shader pass.
  describe("meshAttributeUse", () => {
    it("marks every attribute consumed for a shader whose program declares all of them", () => {
      const { graph, assets, plan } = buildFixture();
      const rows = buildPassRows(plan, graph, assets);
      const row = shaderRow(rows, "s2");
      expect(row.meshAttributeUse).toEqual([
        { name: "a_position", size: 3, consumed: true },
        { name: "a_normal", size: 3, consumed: true },
        { name: "a_uv", size: 2, consumed: true },
      ]);
      plan.dispose();
    });

    it("is empty for the fullscreen-substituted pass — not a mesh the user wired in", () => {
      const { graph, assets, plan } = buildFixture();
      const rows = buildPassRows(plan, graph, assets);
      const row = shaderRow(rows, "s1");
      expect(row.meshAttributeUse).toEqual([]);
      plan.dispose();
    });

    it("is empty for a compute-driven pass", () => {
      const { graph, assets, plan } = buildFixture();
      const rows = buildPassRows(plan, graph, assets);
      const row = shaderRow(rows, "s4");
      expect(row.meshAttributeUse).toEqual([]);
      plan.dispose();
    });
  });
});

// A-2 (T4): vertex↔fragment varying contract, keyed off the *compiled*
// vertex source rather than the node's own `vertexSource`.
describe("buildVaryingContracts", () => {
  // Both shader nodes declare the same fragment: `basic.vert`'s v_normal,
  // statically used. The point of this fixture is that both nodes share
  // `node.vertexSource === basicVert`, so the only thing that can explain a
  // difference in the two nodes' contracts is which vertex source the
  // *compiler* actually saw (fullscreen.vert vs basic.vert) — not what the
  // node itself declares.
  const fragUsingVNormal = `#version 300 es
precision highp float;
in vec3 v_normal;
out vec4 fragColor;
void main() { fragColor = vec4(v_normal, 1.0); }
`;

  function buildVaryingFixture() {
    const graph: Graph = {
      nodes: [
        { id: "mCube", kind: "mesh", primitive: "cube" },
        {
          id: "sFull",
          kind: "shader",
          // basic.vert provides v_normal/v_uv/v_world, but sFull has no mesh
          // edge below, so compile.ts substitutes fullscreen.vert (v_uv
          // only) — node.vertexSource is never handed to the compiler.
          vertexSource: basicVert,
          fragmentSource: fragUsingVNormal,
          uniformValues: {},
        },
        {
          id: "sMesh",
          kind: "shader",
          // Same vertexSource as sFull, but wired to a mesh below, so this
          // one really is compiled against basic.vert.
          vertexSource: basicVert,
          fragmentSource: fragUsingVNormal,
          uniformValues: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: "mCube",
          sourceHandle: "mesh",
          target: "sMesh",
          targetHandle: "mesh",
        },
      ],
    };
    const assets = { meshes: {}, images: {} };
    const gl = makeGl();
    const plan = compileGraph(gl, graph, { width: 64, height: 64, assets });
    return { graph, plan };
  }

  it("uses the compiled vertex source, not the node's own vertexSource, for a fullscreen-substituted node", () => {
    const { graph, plan } = buildVaryingFixture();
    // Proves the fixture actually hit the fullscreen-substitution branch:
    // if this were false, a "missing-out" result below would be meaningless.
    expect(plan.fullscreenByNode.sFull).toBe(true);

    const contracts = buildVaryingContracts(plan, graph);
    const c = contracts.sFull;
    expect(c).toBeDefined();
    const names = c?.rows.map((r) => r.name).sort();
    // v_uv comes from fullscreen.vert (the compiled source); v_normal/v_world
    // — which basic.vert (the node's own, uncompiled vertexSource) would
    // have provided — are absent from the vertex side entirely.
    expect(names).toContain("v_uv");
    const vNormal = c?.rows.find((r) => r.name === "v_normal");
    expect(vNormal?.vertexType).toBeNull();
    expect(vNormal?.status).toBe("missing-out");
    expect(vNormal?.fragmentUsed).toBe(true);
    plan.dispose();
  });

  it("links v_normal for a mesh-connected node, where basic.vert really is the compiled source", () => {
    const { graph, plan } = buildVaryingFixture();
    expect(plan.fullscreenByNode.sMesh).toBe(false);

    const contracts = buildVaryingContracts(plan, graph);
    const c = contracts.sMesh;
    const vNormal = c?.rows.find((r) => r.name === "v_normal");
    expect(vNormal?.vertexType).toBe("vec3");
    expect(vNormal?.status).toBe("linked");
    plan.dispose();
  });

  it("omits nodes absent from plan.compiledVertexSource (never reached the compiler)", () => {
    const { graph } = buildVaryingFixture();
    // emptyPlan is what a fatal validate (e.g. a cycle) yields — every
    // shader node in the graph is present, but none reached compile.ts's
    // per-node loop, so compiledVertexSource is `{}`.
    const contracts = buildVaryingContracts(emptyPlan(64, 64), graph);
    expect(contracts).toEqual({});
  });

  it("ignores non-shader nodes even if compiledVertexSource somehow held an entry for one", () => {
    const { graph, plan } = buildVaryingFixture();
    const withMeshEntry = {
      ...plan,
      compiledVertexSource: {
        ...plan.compiledVertexSource,
        mCube: basicVert,
      },
    };
    const contracts = buildVaryingContracts(withMeshEntry, graph);
    expect(contracts.mCube).toBeUndefined();
    plan.dispose();
  });
});
