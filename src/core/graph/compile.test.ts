import { afterEach, describe, expect, it } from "vitest";
import {
  __setGetUserMediaForTests,
  disposeAllExternal,
  externalHandleCount,
} from "../external/registry";
import { createFakeGl } from "../gl/fakeGl";
import { compileGraph, emptyPlan, scaledDimensions } from "./compile";
import type { Graph } from "./types";

// compileGraph is heavily GL-coupled — most paths require a real
// WebGL2RenderingContext (E2E covers those via SwiftShader). This file targets
// only the GL-free branches:
//   - emptyPlan() shape
//   - compileGraph() early-return on fatal validation errors (cycle / multi_input /
//     multiple_outputs), which never touches `gl`.

const fakeGl = null as unknown as WebGL2RenderingContext;

describe("emptyPlan", () => {
  it("returns a plan with no passes and the supplied dimensions", () => {
    const plan = emptyPlan(800, 600);
    expect(plan.passes).toEqual([]);
    expect(plan.width).toBe(800);
    expect(plan.height).toBe(600);
    expect(plan.outputs).toEqual([]);
    expect(plan.outputNodeId).toBeNull();
    expect(plan.outputSourceNodeId).toBeNull();
    expect(plan.errors).toEqual([]);
    expect(plan.shaderErrors).toEqual({});
    expect(plan.imageTextures).toEqual({});
    expect(plan.fullscreenByNode).toEqual({});
    expect(plan.hasCompute).toBe(false);
    expect(plan.hasExternal).toBe(false);
    expect(typeof plan.dispose).toBe("function");
    expect(() => plan.dispose()).not.toThrow();
  });

  it("dispose is a repeatable no-op (#7 failure-fallback invariant)", () => {
    // On a compile throw the Viewport installs `emptyPlan(w, h)` so the frame
    // loop stops executing the already-disposed plan. The very next recompile
    // opens with `plan.dispose()` again, so that must stay safe — this is why
    // the fallback needs no extra guard.
    const plan = emptyPlan(320, 240);
    expect(() => {
      plan.dispose();
      plan.dispose();
    }).not.toThrow();
    expect(plan.passes).toEqual([]);
  });
});

describe("scaledDimensions", () => {
  it("returns full canvas dimensions at scale 1", () => {
    expect(scaledDimensions(800, 600, 1)).toEqual({ width: 800, height: 600 });
  });

  it("halves and quarters dimensions, rounding to nearest integer", () => {
    expect(scaledDimensions(800, 600, 0.5)).toEqual({
      width: 400,
      height: 300,
    });
    expect(scaledDimensions(800, 600, 0.25)).toEqual({
      width: 200,
      height: 150,
    });
    // 401 * 0.5 = 200.5 → rounds to 201 (nearest), not floored.
    expect(scaledDimensions(401, 401, 0.5)).toEqual({
      width: 201,
      height: 201,
    });
  });

  it("clamps to at least 1px so a tiny canvas never collapses to 0", () => {
    expect(scaledDimensions(2, 2, 0.25)).toEqual({ width: 1, height: 1 });
  });
});

describe("compileGraph external sources (Phase 14)", () => {
  afterEach(() => {
    __setGetUserMediaForTests(null);
    disposeAllExternal();
  });

  it("reconciles a webcam node into the external registry and sets hasExternal", () => {
    // Stub getUserMedia so acquisition does not need a real media device.
    // We don't await the promise — reconcile only needs the spec to be seen.
    __setGetUserMediaForTests(
      () => new Promise(() => {}) as Promise<MediaStream>,
    );
    const graph: Graph = {
      nodes: [{ id: "w1", kind: "webcam" }],
      edges: [],
    };
    const plan = compileGraph(fakeGl, graph, { width: 32, height: 32 });
    expect(plan.hasExternal).toBe(true);
    expect(externalHandleCount()).toBe(1);
  });

  it("preserves hasExternal even when validation fatally fails so the camera survives transient cycles", () => {
    __setGetUserMediaForTests(
      () => new Promise(() => {}) as Promise<MediaStream>,
    );
    const graph: Graph = {
      nodes: [
        { id: "w1", kind: "webcam" },
        {
          id: "a",
          kind: "shader",
          vertexSource: "",
          fragmentSource: "",
          uniformValues: {},
        },
        {
          id: "b",
          kind: "shader",
          vertexSource: "",
          fragmentSource: "",
          uniformValues: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "out",
          target: "b",
          targetHandle: "t",
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "out",
          target: "a",
          targetHandle: "t",
        },
      ],
    };
    const plan = compileGraph(fakeGl, graph, { width: 16, height: 16 });
    expect(plan.errors.some((e) => e.code === "cycle")).toBe(true);
    expect(plan.hasExternal).toBe(true);
    expect(externalHandleCount()).toBe(1);
  });

  it("releases the registry handle when a subsequent compile drops the webcam node", () => {
    __setGetUserMediaForTests(
      () => new Promise(() => {}) as Promise<MediaStream>,
    );
    compileGraph(
      fakeGl,
      { nodes: [{ id: "w1", kind: "webcam" }], edges: [] },
      { width: 8, height: 8 },
    );
    expect(externalHandleCount()).toBe(1);
    const plan2 = compileGraph(
      fakeGl,
      { nodes: [], edges: [] },
      { width: 8, height: 8 },
    );
    expect(plan2.hasExternal).toBe(false);
    expect(externalHandleCount()).toBe(0);
  });

  it("reconciles a video node into the external registry and sets hasExternal", () => {
    const graph: Graph = {
      nodes: [
        {
          id: "v1",
          kind: "video",
          assetId: null,
          playing: false,
          loop: true,
          muted: true,
        },
      ],
      edges: [],
    };
    const plan = compileGraph(fakeGl, graph, { width: 32, height: 32 });
    expect(plan.hasExternal).toBe(true);
    expect(externalHandleCount()).toBe(1);
  });
});

describe("compileGraph fatal-error early return", () => {
  it("returns emptyPlan + cycle error without touching gl", () => {
    // a → b → a cycle. Both nodes are shader nodes so validateGraph reaches
    // cycle detection.
    const graph: Graph = {
      nodes: [
        {
          id: "a",
          kind: "shader",
          vertexSource: "",
          fragmentSource: "",
          uniformValues: {},
        },
        {
          id: "b",
          kind: "shader",
          vertexSource: "",
          fragmentSource: "",
          uniformValues: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "out",
          target: "b",
          targetHandle: "tex",
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "out",
          target: "a",
          targetHandle: "tex",
        },
      ],
    };

    const plan = compileGraph(fakeGl, graph, { width: 100, height: 100 });
    expect(plan.passes).toEqual([]);
    expect(plan.errors.some((e) => e.code === "cycle")).toBe(true);
    expect(plan.width).toBe(100);
    expect(plan.height).toBe(100);
    // fatal validate short-circuits into `emptyPlan` (spread), so this is
    // `{}` too — never a stale/half-built record from a torn-down loop.
    expect(plan.fullscreenByNode).toEqual({});
  });

  it("returns emptyPlan + multi_input error when one target handle has > 1 incoming edge", () => {
    const graph: Graph = {
      nodes: [
        { id: "src1", kind: "mesh", primitive: "cube" },
        { id: "src2", kind: "mesh", primitive: "sphere" },
        {
          id: "dst",
          kind: "shader",
          vertexSource: "",
          fragmentSource: "",
          uniformValues: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: "src1",
          sourceHandle: "mesh",
          target: "dst",
          targetHandle: "mesh",
        },
        {
          id: "e2",
          source: "src2",
          sourceHandle: "mesh",
          target: "dst",
          targetHandle: "mesh",
        },
      ],
    };

    const plan = compileGraph(fakeGl, graph, { width: 50, height: 50 });
    expect(plan.passes).toEqual([]);
    expect(plan.errors.some((e) => e.code === "multi_input")).toBe(true);
  });

  it("returns emptyPlan + multiple_outputs error when Output nodes exceed MAX_OUTPUTS", () => {
    // MAX_OUTPUTS is 4 — five Output nodes triggers the validator.
    const graph: Graph = {
      nodes: [
        { id: "o1", kind: "output" },
        { id: "o2", kind: "output" },
        { id: "o3", kind: "output" },
        { id: "o4", kind: "output" },
        { id: "o5", kind: "output" },
      ],
      edges: [],
    };
    const plan = compileGraph(fakeGl, graph, { width: 64, height: 64 });
    expect(plan.passes).toEqual([]);
    expect(plan.errors.some((e) => e.code === "multiple_outputs")).toBe(true);
  });
});

describe("compileGraph groups (Phase 29)", () => {
  it("treats group nodes as invisible to the render pipeline", () => {
    // A graph with one shader pass, one output, and a couple of group nodes
    // alongside. The presence of groups must not change the plan in any way.
    const graphWithGroups: Graph = {
      nodes: [
        {
          id: "g1",
          kind: "group",
          label: "Section A",
          width: 300,
          height: 200,
        },
        {
          id: "g2",
          kind: "group",
          label: "Section B",
          width: 200,
          height: 150,
        },
      ],
      edges: [],
    };
    const planWith = compileGraph(fakeGl, graphWithGroups, {
      width: 64,
      height: 64,
    });
    expect(planWith.errors).toEqual([]);
    expect(planWith.passes).toEqual([]);
    expect(planWith.hasExternal).toBe(false);
    expect(planWith.hasCompute).toBe(false);
  });
});

describe("compileGraph fullscreenByNode (T1/A-1)", () => {
  function shaderNode(id: string): Graph["nodes"][number] {
    return {
      id,
      kind: "shader",
      vertexSource: "//v",
      fragmentSource: "//f",
      uniformValues: {},
    };
  }

  it("records true for a shader node with no mesh input (fullscreen substitution)", () => {
    const gl = createFakeGl({ attributes: ["a_position"], uniforms: [] });
    const graph: Graph = { nodes: [shaderNode("s1")], edges: [] };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    // Sanity: the pass did actually build (superset claim below is otherwise
    // vacuous — this checks the "normal" success path first).
    expect(plan.shaderPassByNode.has("s1")).toBe(true);
    expect(plan.fullscreenByNode.s1).toBe(true);
    plan.dispose();
  });

  it("records false when a primitive mesh is connected", () => {
    const gl = createFakeGl({
      attributes: ["a_position", "a_normal", "a_uv"],
      uniforms: [],
    });
    const graph: Graph = {
      nodes: [{ id: "m1", kind: "mesh", primitive: "cube" }, shaderNode("s1")],
      edges: [
        {
          id: "e1",
          source: "m1",
          sourceHandle: "mesh",
          target: "s1",
          targetHandle: "mesh",
        },
      ],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    expect(plan.shaderPassByNode.has("s1")).toBe(true);
    expect(plan.fullscreenByNode.s1).toBe(false);
    plan.dispose();
  });

  it("still records true for a mesh-unconnected node whose fragment fails to compile (superset coverage — the record is not gated on createProgram success)", () => {
    const gl = createFakeGl({
      attributes: ["a_position"],
      uniforms: [],
      compileFailure: true,
    });
    const graph: Graph = { nodes: [shaderNode("s1")], edges: [] };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    // No pass exists — createProgram failed — yet the record is still there.
    expect(plan.shaderPassByNode.has("s1")).toBe(false);
    expect(plan.fullscreenByNode.s1).toBe(true);
    plan.dispose();
  });
});

describe("compileGraph withExplicitDefaults binding (T3/C-2)", () => {
  // Seeds land in the pass's separate `seededDefaults` field, NOT merged
  // into `uniformValues`: the Viewport hot-patches
  // `pass.uniformValues = node.uniformValues` every frame, so a merged-in
  // seed was clobbered before the first draw ever bound it (the original
  // C-2 regression — near-black glow on every new node). The stored-wins
  // ordering is enforced by `bindUserUniforms`'s effective-map spread and is
  // covered execute-side in execute.test.ts.
  it("seeds a shader pass's seededDefaults from the fragment source's @default", () => {
    const gl = createFakeGl({ attributes: [], uniforms: [] });
    const graph: Graph = {
      nodes: [
        {
          id: "s1",
          kind: "shader",
          vertexSource: "//v",
          fragmentSource: "uniform float u_x; // @default 3\nvoid main(){}",
          uniformValues: {},
        },
      ],
      edges: [],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const pass = plan.shaderPassByNode.get("s1");
    expect(pass?.seededDefaults.u_x).toBe(3);
    expect(pass?.uniformValues).toEqual({});
    plan.dispose();
  });

  it("keeps a stored shader uniform value in uniformValues alongside the seed (stored wins at bind time)", () => {
    const gl = createFakeGl({ attributes: [], uniforms: [] });
    const graph: Graph = {
      nodes: [
        {
          id: "s1",
          kind: "shader",
          vertexSource: "//v",
          fragmentSource: "uniform float u_x; // @default 3\nvoid main(){}",
          uniformValues: { u_x: 2 },
        },
      ],
      edges: [],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const pass = plan.shaderPassByNode.get("s1");
    // Seeds are computed from source alone; the stored value stays in
    // uniformValues and out-spreads the seed in bindUserUniforms.
    expect(pass?.seededDefaults.u_x).toBe(3);
    expect(pass?.uniformValues.u_x).toBe(2);
    plan.dispose();
  });

  it("seeds a compute pass's seededDefaults from the vertex source's @default", () => {
    const gl = createFakeGl({ attributes: ["a_position"], uniforms: [] });
    const graph: Graph = {
      nodes: [
        {
          id: "c1",
          kind: "compute",
          vertexSource:
            "uniform float u_y; // @default 5\nin vec3 a_position;\nout vec3 v_position;\nvoid main(){ v_position = a_position; }",
          count: 4,
          primitive: "POINTS",
          attributes: [
            {
              inName: "a_position",
              outName: "v_position",
              size: 3,
              seed: "zero",
            },
          ],
          uniformValues: {},
        },
      ],
      edges: [],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const pass = plan.passByNode.get("c1");
    expect(pass?.kind).toBe("compute");
    expect(pass?.seededDefaults.u_y).toBe(5);
    expect(pass?.uniformValues).toEqual({});
    plan.dispose();
  });
});
