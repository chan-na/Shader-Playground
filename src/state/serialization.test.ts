import { describe, expect, it } from "vitest";
import type { ComputeGraphNode, Graph } from "../core/graph/types";
import {
  CHAIN_DEMO_LAYOUT,
  createChainDemoGraph,
  createDemoGraph,
  createParticleDemoGraph,
  DEMO_LAYOUT,
  PARTICLE_DEMO_LAYOUT,
} from "./demoGraph";
import {
  deserializeProject,
  PROJECT_FORMAT_VERSION,
  serializeProject,
} from "./serialization";

describe("serializeProject / deserializeProject", () => {
  it("round-trips the single-shader demo graph", () => {
    const graph = createDemoGraph();
    const serialized = serializeProject(graph, DEMO_LAYOUT);
    const json = JSON.parse(JSON.stringify(serialized));
    const restored = deserializeProject(json);
    expect(restored.graph.nodes.map((n) => n.id).sort()).toEqual(
      graph.nodes.map((n) => n.id).sort(),
    );
    expect(restored.graph.edges).toEqual(graph.edges);
    expect(restored.positions).toEqual(DEMO_LAYOUT);
    expect(restored.warnings).toEqual([]);
  });

  it("round-trips the chain demo graph (multiple shaders, sampler edges)", () => {
    const graph = createChainDemoGraph();
    const serialized = serializeProject(graph, CHAIN_DEMO_LAYOUT);
    const restored = deserializeProject(JSON.parse(JSON.stringify(serialized)));
    expect(restored.graph.edges.map((e) => e.targetHandle).sort()).toEqual(
      graph.edges.map((e) => e.targetHandle).sort(),
    );
    expect(restored.warnings).toEqual([]);
  });

  it("preserves uniform values on shader nodes", () => {
    const graph = createChainDemoGraph();
    const serialized = serializeProject(graph, CHAIN_DEMO_LAYOUT);
    const restored = deserializeProject(JSON.parse(JSON.stringify(serialized)));
    const noise = restored.graph.nodes.find((n) => n.id === "noise1");
    expect(noise?.kind).toBe("shader");
    if (noise?.kind === "shader") {
      expect(noise.uniformValues.u_scale).toBe(6);
      expect(noise.uniformValues.u_tint).toEqual([0.4, 0.8, 1.0]);
    }
  });

  it("round-trips a compute node (Phase 13)", () => {
    const graph: Graph = createParticleDemoGraph();
    const serialized = serializeProject(graph, PARTICLE_DEMO_LAYOUT);
    const restored = deserializeProject(JSON.parse(JSON.stringify(serialized)));
    const compute = restored.graph.nodes.find((n) => n.kind === "compute") as
      | ComputeGraphNode
      | undefined;
    expect(compute).toBeDefined();
    if (!compute) return;
    expect(compute.count).toBe(1024);
    expect(compute.primitive).toBe("POINTS");
    expect(compute.attributes.length).toBe(2);
    expect(compute.attributes[0]?.inName).toBe("a_position");
    expect(compute.attributes[0]?.outName).toBe("v_position");
    expect(compute.attributes[0]?.seed).toBe("sphere");
    expect(compute.uniformValues.u_dt).toBe(0.016);
    expect(restored.warnings).toEqual([]);
  });

  it("rejects payload with wrong format tag", () => {
    expect(() =>
      deserializeProject({
        format: "other",
        version: 1,
        graph: { nodes: [], edges: [] },
      }),
    ).toThrow();
  });

  it("rejects payload missing graph", () => {
    expect(() =>
      deserializeProject({ format: "shader-playground", version: 1 }),
    ).toThrow();
  });

  it("attaches a warning for future format versions but still loads", () => {
    const payload = serializeProject(createDemoGraph(), DEMO_LAYOUT);
    payload.version = PROJECT_FORMAT_VERSION + 5;
    const restored = deserializeProject(JSON.parse(JSON.stringify(payload)));
    expect(
      restored.warnings.some((w) => w.includes("newer than supported")),
    ).toBe(true);
    expect(restored.graph.nodes.length).toBe(payload.graph.nodes.length);
  });

  it("strips positions for unknown node ids", () => {
    const graph = createDemoGraph();
    const positions = { ...DEMO_LAYOUT, ghost: { x: 999, y: 999 } };
    const serialized = serializeProject(graph, positions);
    expect(serialized.positions.ghost).toBeUndefined();
  });
});
