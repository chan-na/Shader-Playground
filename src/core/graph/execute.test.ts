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
