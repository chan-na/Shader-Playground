import { afterEach, describe, expect, it } from "vitest";
import {
  __setGetUserMediaForTests,
  disposeAllExternal,
  externalHandleCount,
} from "../external/registry";
import { compileGraph, emptyPlan } from "./compile";
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
    expect(plan.hasCompute).toBe(false);
    expect(plan.hasExternal).toBe(false);
    expect(typeof plan.dispose).toBe("function");
    expect(() => plan.dispose()).not.toThrow();
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
