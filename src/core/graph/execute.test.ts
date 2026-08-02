import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCameraState } from "../camera/orbitCamera";
import { disposeAllExternal } from "../external/registry";
import { createFakeGl } from "../gl/fakeGl";
import { compileGraph } from "./compile";
import { executePlan, type FrameContext, resetComposite } from "./execute";
import type {
  ComputeGraphNode,
  Graph,
  GraphNode,
  ShaderGraphNode,
} from "./types";

// Render-heart harness for executePlan. `createFakeGl` returns truthy handles so
// `compileGraph` builds real ShaderPass/ComputePass objects (FBOs, VAOs, TF
// objects); every draw/state call is a no-op we can spy on. This exercises the
// ping-pong swap, compute-mesh VAO selection, sampler binding, composite vs
// placeholder branch, and dispose — none of which had unit coverage before (the
// full pipeline is otherwise only covered by Playwright + SwiftShader). (L35)

function makeGl(): WebGL2RenderingContext {
  // The fullscreen quad needs `a_position`; compute passes read `a_pos`. All
  // sampler/system uniforms the tests touch must be "active" so getUniformLocation
  // resolves them.
  // `u_mouse` must be listed or getUniformLocation never resolves it and the
  // pass-space transform assertions below would silently check nothing (#19).
  return createFakeGl({
    attributes: ["a_position", "a_pos"],
    uniforms: ["u_time", "u_resolution", "u_src", "u_mouse"],
  });
}

function frameCtx(graph?: Graph): FrameContext {
  return {
    time: 0,
    width: 32,
    height: 32,
    camera: defaultCameraState(),
    ...(graph ? { graph } : {}),
  };
}

function shaderNode(id: string): ShaderGraphNode {
  return {
    id,
    kind: "shader",
    vertexSource: "//v",
    fragmentSource: "//f",
    uniformValues: {},
  };
}

function computeNode(id: string): ComputeGraphNode {
  return {
    id,
    kind: "compute",
    vertexSource: "//v",
    count: 4,
    primitive: "POINTS",
    attributes: [{ inName: "a_pos", outName: "v_pos", size: 3, seed: "zero" }],
    uniformValues: {},
  };
}

function outputNode(id: string): GraphNode {
  return { id, kind: "output" };
}

type Edge = Graph["edges"][number];
function edge(
  id: string,
  source: string,
  target: string,
  targetHandle: string,
): Edge {
  return { id, source, sourceHandle: "out", target, targetHandle };
}

afterEach(() => {
  // Clear the module-level composite (and blank-texture) cache so each test
  // starts from a fresh GL context; drop any external registry handles too.
  resetComposite(null);
  disposeAllExternal();
});

describe("executePlan — compute ping-pong", () => {
  it("flips the compute pass read side on every frame", () => {
    const gl = makeGl();
    const plan = compileGraph(
      gl,
      { nodes: [computeNode("c1")], edges: [] },
      { width: 32, height: 32 },
    );
    expect(plan.passes).toHaveLength(1);
    const cp = plan.passes[0]!;
    expect(cp.kind).toBe("compute");
    if (cp.kind !== "compute") return;

    expect(cp.read).toBe("A");
    executePlan(gl, plan, frameCtx(), 32, 32);
    expect(cp.read).toBe("B");
    executePlan(gl, plan, frameCtx(), 32, 32);
    expect(cp.read).toBe("A");
    plan.dispose();
  });
});

describe("executePlan — compute-driven mesh VAO selection", () => {
  it("binds the VAO matching the compute pass's post-swap read side", () => {
    const gl = makeGl();
    const graph: Graph = {
      nodes: [computeNode("c1"), shaderNode("s1"), outputNode("o1")],
      edges: [
        edge("e1", "c1", "s1", "mesh"),
        edge("e2", "s1", "o1", "texture"),
      ],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const sp = plan.passes.find((p) => p.nodeId === "s1");
    expect(sp?.kind).toBe("shader");
    if (!sp || sp.kind !== "shader") return;
    expect(sp.meshComputeVaos).not.toBeNull();
    const vaos = sp.meshComputeVaos!;

    // Before any frame the mesh points at the A-side VAO.
    expect(sp.mesh.vao).toBe(vaos[0]);
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    // The compute pass swapped read A→B, so the shader now draws the B side.
    expect(sp.mesh.vao).toBe(vaos[1]);
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    expect(sp.mesh.vao).toBe(vaos[0]);
    plan.dispose();
  });
});

describe("executePlan — sampler binding", () => {
  it("binds an upstream shader pass's color texture into a downstream sampler", () => {
    const gl = makeGl();
    const graph: Graph = {
      nodes: [shaderNode("a"), shaderNode("b"), outputNode("o1")],
      edges: [edge("e1", "a", "b", "u_src"), edge("e2", "b", "o1", "texture")],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const pa = plan.passes.find((p) => p.nodeId === "a");
    if (!pa || pa.kind !== "shader") throw new Error("missing pass a");

    const bindTex = vi.spyOn(gl, "bindTexture");
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    expect(bindTex.mock.calls.some((c) => c[1] === pa.fbo.color.texture)).toBe(
      true,
    );
    plan.dispose();
  });
});

describe("executePlan — composite vs placeholder", () => {
  it("composites each drawable output's texture in one extra draw", () => {
    const gl = makeGl();
    const graph: Graph = {
      nodes: [shaderNode("s1"), outputNode("o1")],
      edges: [edge("e1", "s1", "o1", "texture")],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const sp = plan.passes.find((p) => p.nodeId === "s1");
    if (!sp || sp.kind !== "shader") throw new Error("missing shader pass");

    const bindTex = vi.spyOn(gl, "bindTexture");
    const draw = vi.spyOn(gl, "drawArrays");
    executePlan(gl, plan, frameCtx(graph), 32, 32);

    // The output's source texture is bound during the composite pass.
    expect(bindTex.mock.calls.some((c) => c[1] === sp.fbo.color.texture)).toBe(
      true,
    );
    // One draw for the shader pass + one for the single composite dispatch.
    expect(draw.mock.calls).toHaveLength(2);
    plan.dispose();
  });

  it("draws the placeholder and skips the composite when nothing is drawable", () => {
    const gl = makeGl();
    // Output node with no incoming texture edge → nothing to composite.
    const graph: Graph = {
      nodes: [shaderNode("s1"), outputNode("o1")],
      edges: [],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const draw = vi.spyOn(gl, "drawArrays");
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    // Only the shader pass draws; the composite dispatch is skipped.
    expect(draw.mock.calls).toHaveLength(1);
    plan.dispose();
  });
});

describe("executePlan — L5 stale-texture placeholder", () => {
  it("binds an opaque-black placeholder when a sampler source failed to compile", () => {
    const gl = makeGl();
    const graph: Graph = {
      nodes: [shaderNode("a"), shaderNode("b"), outputNode("o1")],
      edges: [edge("e1", "a", "b", "u_src"), edge("e2", "b", "o1", "texture")],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    // Model a compile failure for the upstream source: its pass is absent, but
    // the node is still present in the graph.
    plan.passes = plan.passes.filter((p) => p.nodeId !== "a");
    plan.passByNode.delete("a");
    plan.shaderPassByNode.delete("a");

    const created: WebGLTexture[] = [];
    const origCreate = gl.createTexture.bind(gl);
    vi.spyOn(gl, "createTexture").mockImplementation(() => {
      const t = origCreate();
      created.push(t!);
      return t;
    });
    const bindTex = vi.spyOn(gl, "bindTexture");
    executePlan(gl, plan, frameCtx(graph), 32, 32);

    // Exactly one texture is created during the frame — the lazy placeholder —
    // and it is bound for node b's now-sourceless sampler.
    expect(created).toHaveLength(1);
    const blank = created[0]!;
    expect(bindTex.mock.calls.some((c) => c[1] === blank)).toBe(true);
    plan.dispose();
  });

  it("leaves the unit unbound for a non-render source (unloaded image), not black", () => {
    const gl = makeGl();
    const graph: Graph = {
      nodes: [
        { id: "img", kind: "image", assetId: null },
        shaderNode("b"),
        outputNode("o1"),
      ],
      edges: [
        edge("e1", "img", "b", "u_src"),
        edge("e2", "b", "o1", "texture"),
      ],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });

    const created: WebGLTexture[] = [];
    const origCreate = gl.createTexture.bind(gl);
    vi.spyOn(gl, "createTexture").mockImplementation(() => {
      const t = origCreate();
      created.push(t!);
      return t;
    });
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    // No placeholder is created — an unloaded image just leaves the unit as-is
    // rather than forcing it black.
    expect(created).toHaveLength(0);
    plan.dispose();
  });
});

describe("executePlan — u_mouse pass-space transform (#19)", () => {
  /**
   * Build a single shader → output plan at `scale` and return the pass plus the
   * `uniform4f` spy. Asserting on the *argument values* (not merely that
   * uniform4f was called) is deliberate: a later refactor of
   * `bindSystemUniforms` that drops the transform must fail here.
   */
  function setup(scale: 0.25 | 0.5 | 1, w: number, h: number) {
    const gl = makeGl();
    const s: ShaderGraphNode = { ...shaderNode("s1"), resolutionScale: scale };
    const graph: Graph = {
      nodes: [s, outputNode("o1")],
      edges: [edge("e1", "s1", "o1", "texture")],
    };
    const plan = compileGraph(gl, graph, { width: w, height: h });
    const sp = plan.passes.find((p) => p.nodeId === "s1");
    if (!sp || sp.kind !== "shader") throw new Error("missing shader pass");
    const loc = sp.program.uniforms.u_mouse;
    // Guard, not a courtesy: if `u_mouse` never resolved every assertion below
    // would look for a call that is never made and the suite would be vacuous.
    if (!loc) throw new Error("u_mouse location was not resolved");
    const uniform4f = vi.spyOn(gl, "uniform4f");
    return { gl, graph, plan, sp, loc, uniform4f };
  }

  type Uniform4fCall = [
    WebGLUniformLocation | null,
    number,
    number,
    number,
    number,
  ];

  function mouseArgs(
    calls: Uniform4fCall[],
    loc: WebGLUniformLocation,
  ): number[] {
    // uniform4f is also used for the composite cell rects, so filter by the
    // location object rather than taking the first call.
    const call = calls.find((c) => c[0] === loc);
    if (!call) throw new Error("u_mouse was never uploaded");
    return [call[1], call[2], call[3], call[4]];
  }

  it("passes the pointer through unchanged for a full-resolution pass", () => {
    const { gl, graph, plan, sp, loc, uniform4f } = setup(1, 32, 32);
    expect([sp.width, sp.height]).toEqual([32, 32]);
    executePlan(
      gl,
      plan,
      { ...frameCtx(graph), width: 32, height: 32, mouse: [24, 12, 8, 4] },
      32,
      32,
    );
    expect(mouseArgs(uniform4f.mock.calls, loc)).toEqual([24, 12, 8, 4]);
    plan.dispose();
  });

  it("rescales xy and zw into a downsampled pass's own pixel space", () => {
    const { gl, graph, plan, sp, loc, uniform4f } = setup(0.5, 32, 32);
    expect([sp.width, sp.height]).toEqual([16, 16]);
    executePlan(
      gl,
      plan,
      { ...frameCtx(graph), width: 32, height: 32, mouse: [24, 12, 8, 4] },
      32,
      32,
    );
    // Both the live position (xy) and the last-click position (zw) move, so
    // `u_mouse.xy / u_resolution` still lands in 0..1 inside the small pass.
    expect(mouseArgs(uniform4f.mock.calls, loc)).toEqual([12, 6, 4, 2]);
    plan.dispose();
  });

  it("uses the width ratio for x/z and the height ratio for y/w", () => {
    // Per-axis pin: a resolutionScale is uniform, so the only way to tell an
    // axis swap apart is to feed a context whose two ratios differ.
    const { gl, graph, plan, loc, uniform4f } = setup(0.5, 32, 32);
    executePlan(
      gl,
      plan,
      { ...frameCtx(graph), width: 32, height: 16, mouse: [24, 12, 8, 4] },
      32,
      16,
    );
    // x/z: 16/32 = 0.5 · y/w: 16/16 = 1.
    expect(mouseArgs(uniform4f.mock.calls, loc)).toEqual([12, 12, 4, 4]);
    plan.dispose();
  });

  it("guards a zero-sized context instead of producing NaN", () => {
    const { gl, graph, plan, loc, uniform4f } = setup(1, 32, 32);
    executePlan(
      gl,
      plan,
      { ...frameCtx(graph), width: 0, height: 0, mouse: [1, 1, 0, 0] },
      32,
      32,
    );
    // Math.max(1, 0) keeps the divisor finite: 32/1 on both axes.
    expect(mouseArgs(uniform4f.mock.calls, loc)).toEqual([32, 32, 0, 0]);
    plan.dispose();
  });

  it("defaults to an all-zero pointer when ctx.mouse is omitted", () => {
    const { gl, graph, plan, loc, uniform4f } = setup(0.5, 32, 32);
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    expect(mouseArgs(uniform4f.mock.calls, loc)).toEqual([0, 0, 0, 0]);
    plan.dispose();
  });
});

describe("executePlan — int/ivec uniform dispatch (#11)", () => {
  // GLSL type enums live on the context in the real and the fake gl alike —
  // read them from a throwaway instance instead of re-typing hex literals.
  const glConst = createFakeGl();

  // A separate gl factory rather than an edit to `makeGl`: the existing
  // `uniforms`-only call sites stay untouched, `uniformTypes` is additive.
  function typedGl(
    uniforms: string[],
    uniformTypes: Record<string, number>,
  ): WebGL2RenderingContext {
    return createFakeGl({
      attributes: ["a_position", "a_pos"],
      uniforms,
      uniformTypes,
    });
  }

  function shaderPlan(
    gl: WebGL2RenderingContext,
    uniformValues: Record<string, number | number[]> = {},
  ) {
    const s: ShaderGraphNode = { ...shaderNode("s1"), uniformValues };
    const graph: Graph = {
      nodes: [s, outputNode("o1")],
      edges: [edge("e1", "s1", "o1", "texture")],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const sp = plan.passes.find((p) => p.nodeId === "s1");
    if (!sp || sp.kind !== "shader") throw new Error("missing shader pass");
    return { graph, plan, sp };
  }

  /** Args of the single spy call made against `loc`. */
  function argsFor(
    calls: unknown[][],
    loc: WebGLUniformLocation,
  ): unknown[] | undefined {
    return calls.find((c) => c[0] === loc)?.slice(1);
  }

  it("uploads an int system uniform with uniform1i, not uniform1f", () => {
    const gl = typedGl(["u_time", "u_frame"], { u_frame: glConst.INT });
    const { graph, plan, sp } = shaderPlan(gl);
    const loc = sp.program.uniforms.u_frame;
    if (!loc) throw new Error("u_frame location was not resolved");
    const i1 = vi.spyOn(gl, "uniform1i");
    const f1 = vi.spyOn(gl, "uniform1f");
    executePlan(gl, plan, { ...frameCtx(graph), frame: 7 }, 32, 32);
    expect(argsFor(i1.mock.calls, loc)).toEqual([7]);
    expect(argsFor(f1.mock.calls, loc)).toBeUndefined();
    plan.dispose();
  });

  it("leaves float vectors on the float path (gate is int types, not !FLOAT)", () => {
    // Gating on "anything that isn't GL_FLOAT" would drag FLOAT_VEC2 (and
    // SAMPLER_2D) into the integer entry points and break working shaders.
    const gl = typedGl(["u_resolution", "u_src"], {
      u_resolution: glConst.FLOAT_VEC2,
      u_src: glConst.SAMPLER_2D,
    });
    const { graph, plan, sp } = shaderPlan(gl);
    const loc = sp.program.uniforms.u_resolution;
    if (!loc) throw new Error("u_resolution location was not resolved");
    const f2 = vi.spyOn(gl, "uniform2f");
    const i2 = vi.spyOn(gl, "uniform2i");
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    expect(argsFor(f2.mock.calls, loc)).toEqual([32, 32]);
    expect(i2).not.toHaveBeenCalled();
    plan.dispose();
  });

  it("keeps BOOL on the float path (a float upload is legal in GLES3)", () => {
    const gl = typedGl(["u_flag"], { u_flag: glConst.BOOL });
    const { graph, plan, sp } = shaderPlan(gl, { u_flag: 1 });
    const loc = sp.program.uniforms.u_flag;
    if (!loc) throw new Error("u_flag location was not resolved");
    const f1 = vi.spyOn(gl, "uniform1f");
    const i1 = vi.spyOn(gl, "uniform1i");
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    expect(argsFor(f1.mock.calls, loc)).toEqual([1]);
    expect(argsFor(i1.mock.calls, loc)).toBeUndefined();
    plan.dispose();
  });

  it("rounds user int/ivec values into uniform1i/2i/3i/4i", () => {
    const gl = typedGl(["u_steps", "u_cell", "u_rgb", "u_box"], {
      u_steps: glConst.INT,
      u_cell: glConst.INT_VEC2,
      u_rgb: glConst.INT_VEC3,
      u_box: glConst.INT_VEC4,
    });
    const { graph, plan, sp } = shaderPlan(gl, {
      u_steps: 2.6,
      u_cell: [1.4, 2.6],
      u_rgb: [-1.6, 1.5, 2],
      u_box: [0, 1, 2.5, 3.49],
    });
    const u = sp.program.uniforms;
    const spies = {
      1: vi.spyOn(gl, "uniform1i"),
      2: vi.spyOn(gl, "uniform2i"),
      3: vi.spyOn(gl, "uniform3i"),
      4: vi.spyOn(gl, "uniform4i"),
    };
    executePlan(gl, plan, frameCtx(graph), 32, 32);
    expect(argsFor(spies[1].mock.calls, u.u_steps!)).toEqual([3]);
    expect(argsFor(spies[2].mock.calls, u.u_cell!)).toEqual([1, 3]);
    expect(argsFor(spies[3].mock.calls, u.u_rgb!)).toEqual([-2, 2, 2]);
    expect(argsFor(spies[4].mock.calls, u.u_box!)).toEqual([0, 1, 3, 3]);
    plan.dispose();
  });

  it("dispatches int uniforms for compute passes too (#40 shared reflection)", () => {
    // Compute programs are linked by createTransformFeedbackProgram; before the
    // shared tail existed this path could silently keep the float dispatch.
    const gl = typedGl(["u_frame", "u_steps"], {
      u_frame: glConst.INT,
      u_steps: glConst.INT,
    });
    const c: ComputeGraphNode = {
      ...computeNode("c1"),
      uniformValues: { u_steps: 4.2 },
    };
    const graph: Graph = { nodes: [c], edges: [] };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const cp = plan.passes[0];
    if (!cp || cp.kind !== "compute") throw new Error("missing compute pass");
    const u = cp.program.uniforms;
    const i1 = vi.spyOn(gl, "uniform1i");
    executePlan(gl, plan, { ...frameCtx(graph), frame: 5 }, 32, 32);
    expect(argsFor(i1.mock.calls, u.u_frame!)).toEqual([5]);
    expect(argsFor(i1.mock.calls, u.u_steps!)).toEqual([4]);
    plan.dispose();
  });
});

describe("executePlan — render state (E-2)", () => {
  it("disables BLEND/CULL_FACE on every shader pass; DEPTH_TEST follows meshIsFullscreen", () => {
    const gl = makeGl();
    const graph: Graph = {
      nodes: [
        { id: "m1", kind: "mesh", primitive: "sphere" },
        shaderNode("meshPass"),
        shaderNode("fullscreenPass"),
        outputNode("o1"),
        outputNode("o2"),
      ],
      edges: [
        edge("e1", "m1", "meshPass", "mesh"),
        edge("e2", "meshPass", "o1", "texture"),
        edge("e3", "fullscreenPass", "o2", "texture"),
      ],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const meshP = plan.passes.find((p) => p.nodeId === "meshPass");
    const fsP = plan.passes.find((p) => p.nodeId === "fullscreenPass");
    if (!meshP || meshP.kind !== "shader") throw new Error("missing meshPass");
    if (!fsP || fsP.kind !== "shader") {
      throw new Error("missing fullscreenPass");
    }
    expect(meshP.meshIsFullscreen).toBe(false);
    expect(fsP.meshIsFullscreen).toBe(true);

    const enable = vi.spyOn(gl, "enable");
    const disable = vi.spyOn(gl, "disable");
    executePlan(gl, plan, frameCtx(graph), 32, 32);

    // L4: blend/cull are always off — neither is exposed as a node/port yet.
    // One disable(BLEND)/disable(CULL_FACE) call per shader pass (2 passes).
    expect(disable.mock.calls.filter((c) => c[0] === gl.BLEND)).toHaveLength(2);
    expect(
      disable.mock.calls.filter((c) => c[0] === gl.CULL_FACE),
    ).toHaveLength(2);
    expect(enable.mock.calls.some((c) => c[0] === gl.BLEND)).toBe(false);
    expect(enable.mock.calls.some((c) => c[0] === gl.CULL_FACE)).toBe(false);

    // DEPTH_TEST: on for the mesh-connected pass, off for the fullscreen one.
    expect(enable.mock.calls.some((c) => c[0] === gl.DEPTH_TEST)).toBe(true);
    expect(disable.mock.calls.some((c) => c[0] === gl.DEPTH_TEST)).toBe(true);

    plan.dispose();
  });
});

// C-2 regression guard: the Viewport hot-patches
// `pass.uniformValues = node.uniformValues` on every RAF tick, *before* the
// first executePlan. When compile.ts merged `@default` seeds directly into
// `pass.uniformValues`, that assignment clobbered them — the seed never
// reached the GPU and every brand-new node (`uniformValues: {}`) rendered
// with GL-zero uniforms (near-black glow). Seeds now live in the pass's
// separate `seededDefaults` field, composed by bindUserUniforms per frame,
// which is exactly what these tests reproduce and pin.
describe("executePlan — @default seeds survive the uniform hot-patch (C-2)", () => {
  function seededGraph(stored: Record<string, number | number[]>): Graph {
    return {
      nodes: [
        {
          id: "s1",
          kind: "shader",
          vertexSource: "//v",
          fragmentSource: "uniform float u_x; // @default 3\nvoid main(){}",
          uniformValues: stored,
        },
      ],
      edges: [],
    };
  }

  function makeSeedGl(): WebGL2RenderingContext {
    // `u_x` must be an active uniform or bindUserUniforms never resolves a
    // location for it and the upload assertions would check nothing.
    return createFakeGl({ attributes: ["a_position"], uniforms: ["u_x"] });
  }

  it("uploads the seeded default after a Viewport-style hot-patch replaces uniformValues with the node's empty map", () => {
    const gl = makeSeedGl();
    const plan = compileGraph(gl, seededGraph({}), { width: 32, height: 32 });
    const pass = plan.shaderPassByNode.get("s1");
    if (!pass) throw new Error("missing shader pass");

    // Mimic ui/Viewport/index.tsx's per-frame hot-patch: a brand-new node's
    // live stored map ({}) replaces the pass's map wholesale before the
    // first draw. This exact assignment used to erase the seed for good.
    pass.uniformValues = {};

    const spy = vi.spyOn(gl, "uniform1f");
    executePlan(gl, plan, frameCtx(seededGraph({})), 32, 32);
    // ctx.time is 0, so the only 3-valued float upload can be u_x's seed.
    expect(spy.mock.calls.some((c) => c[1] === 3)).toBe(true);
    plan.dispose();
  });

  it("a hot-patched stored value still wins over the seed (stored > @default > GL zero)", () => {
    const gl = makeSeedGl();
    const stored = { u_x: 2 };
    const plan = compileGraph(gl, seededGraph(stored), {
      width: 32,
      height: 32,
    });
    const pass = plan.shaderPassByNode.get("s1");
    if (!pass) throw new Error("missing shader pass");

    pass.uniformValues = stored;

    const spy = vi.spyOn(gl, "uniform1f");
    executePlan(gl, plan, frameCtx(seededGraph(stored)), 32, 32);
    expect(spy.mock.calls.some((c) => c[1] === 2)).toBe(true);
    expect(spy.mock.calls.some((c) => c[1] === 3)).toBe(false);
    plan.dispose();
  });
});

describe("executePlan — dispose", () => {
  it("plan.dispose deletes programs, framebuffers, buffers, and TF objects", () => {
    const gl = makeGl();
    const graph: Graph = {
      nodes: [computeNode("c1"), shaderNode("s1"), outputNode("o1")],
      edges: [
        edge("e1", "c1", "s1", "mesh"),
        edge("e2", "s1", "o1", "texture"),
      ],
    };
    const plan = compileGraph(gl, graph, { width: 32, height: 32 });
    const delProgram = vi.spyOn(gl, "deleteProgram");
    const delFbo = vi.spyOn(gl, "deleteFramebuffer");
    const delBuffer = vi.spyOn(gl, "deleteBuffer");
    const delTf = vi.spyOn(gl, "deleteTransformFeedback");

    plan.dispose();
    expect(delProgram).toHaveBeenCalled();
    expect(delFbo).toHaveBeenCalled();
    expect(delBuffer).toHaveBeenCalled();
    expect(delTf).toHaveBeenCalled();
  });
});
