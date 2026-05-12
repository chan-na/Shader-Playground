import { describe, expect, it } from "vitest";
import type { ShaderGraphNode } from "../core/graph/types";
import { topologicalOrder, validateGraph } from "../core/graph/validate";
import { NODE_META } from "../core/nodes/registry";
import {
  CHAIN_DEMO_LAYOUT,
  createChainDemoGraph,
  createDemoGraph,
  createParticleDemoGraph,
  createSplitDemoGraph,
  createTorusDemoGraph,
  DEMO_LAYOUT,
  PARTICLE_DEMO_LAYOUT,
  SPLIT_DEMO_LAYOUT,
  TORUS_DEMO_LAYOUT,
} from "./demoGraph";

describe("createDemoGraph (single shader)", () => {
  it("produces a valid graph", () => {
    expect(validateGraph(createDemoGraph())).toEqual([]);
  });
  it("has a layout entry for every node", () => {
    for (const n of createDemoGraph().nodes) {
      expect(DEMO_LAYOUT[n.id]).toBeDefined();
    }
  });
});

describe("createChainDemoGraph (noise → blur → tonemap → output)", () => {
  const graph = createChainDemoGraph();

  it("passes validation (no cycles, no multi-input, single output)", () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it("orders shader passes so each samples its predecessor", () => {
    const order = topologicalOrder(graph).map((n) => n.id);
    expect(order.indexOf("noise1")).toBeLessThan(order.indexOf("blur1"));
    expect(order.indexOf("blur1")).toBeLessThan(order.indexOf("tonemap1"));
    expect(order.indexOf("tonemap1")).toBeLessThan(order.indexOf("output1"));
  });

  it("exposes blur/tonemap sampler uniforms as texture input ports", () => {
    const meta = NODE_META.shader;
    for (const id of ["blur1", "tonemap1"]) {
      const node = graph.nodes.find((n) => n.id === id) as ShaderGraphNode;
      const ports = meta.inputs(node);
      expect(
        ports.find((p) => p.name === "u_tex" && p.type === "texture"),
      ).toBeDefined();
    }
  });

  it("noise pass has no sampler input port (it is the chain head)", () => {
    const meta = NODE_META.shader;
    const node = graph.nodes.find((n) => n.id === "noise1") as ShaderGraphNode;
    const ports = meta.inputs(node);
    expect(ports.find((p) => p.type === "texture")).toBeUndefined();
  });

  it("chain edges route ShaderNode → ShaderNode through sampler handles", () => {
    const samplerEdges = graph.edges.filter((e) => e.targetHandle === "u_tex");
    expect(samplerEdges).toHaveLength(2);
    expect(samplerEdges.every((e) => e.sourceHandle === "texture")).toBe(true);
  });

  it("has a layout entry for every node", () => {
    for (const n of graph.nodes) {
      expect(CHAIN_DEMO_LAYOUT[n.id]).toBeDefined();
    }
  });
});

describe("createTorusDemoGraph (uv-debug on torus)", () => {
  const graph = createTorusDemoGraph();

  it("passes validation", () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it("uses a torus primitive on the mesh node", () => {
    const meshNode = graph.nodes.find((n) => n.id === "mesh1");
    expect(meshNode?.kind).toBe("mesh");
    expect((meshNode as { primitive?: string }).primitive).toBe("torus");
  });

  it("has a layout entry for every node", () => {
    for (const n of graph.nodes) {
      expect(TORUS_DEMO_LAYOUT[n.id]).toBeDefined();
    }
  });
});

describe("createSplitDemoGraph (three outputs)", () => {
  const graph = createSplitDemoGraph();

  it("passes validation (Output count ≤ MAX_OUTPUTS)", () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it("exposes three Output nodes for the split viewport", () => {
    const outputs = graph.nodes.filter((n) => n.kind === "output");
    expect(outputs).toHaveLength(3);
  });

  it("has a layout entry for every node", () => {
    for (const n of graph.nodes) {
      expect(SPLIT_DEMO_LAYOUT[n.id]).toBeDefined();
    }
  });
});

describe("createParticleDemoGraph (compute → render → output)", () => {
  const graph = createParticleDemoGraph();

  it("passes validation", () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it("has a compute node feeding the shader mesh input", () => {
    const compute = graph.nodes.find((n) => n.kind === "compute");
    expect(compute).toBeDefined();
    const meshEdge = graph.edges.find((e) => e.targetHandle === "mesh");
    expect(meshEdge?.source).toBe(compute?.id);
  });

  it("has a layout entry for every node", () => {
    for (const n of graph.nodes) {
      expect(PARTICLE_DEMO_LAYOUT[n.id]).toBeDefined();
    }
  });
});
