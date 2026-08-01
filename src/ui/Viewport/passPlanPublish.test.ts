import { describe, expect, it } from "vitest";
import { makePrimitive } from "../../core/assets/primitives";
import { createFakeGl } from "../../core/gl/fakeGl";
import { compileGraph } from "../../core/graph/compile";
import type { Graph } from "../../core/graph/types";
import type { ComputePassRow, ShaderPassRow } from "../../state/passPlanStore";
import { buildPassRows } from "./passPlanPublish";

// Attribute set shared by every fake-gl-compiled program in this file: the
// fixed 3-attribute mesh contract (a_position/a_normal/a_uv, see
// core/assets/primitives.ts) plus the compute node's ping-pong slot (a_pos).
function makeGl() {
  return createFakeGl({
    attributes: ["a_position", "a_normal", "a_uv", "a_pos"],
    uniforms: [],
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
        fragmentSource: "//f",
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
        fragmentSource: "//f",
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
});
