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

  it("rejects null/non-object payloads", () => {
    expect(() => deserializeProject(null)).toThrow(/not an object/);
    expect(() => deserializeProject("string")).toThrow();
  });

  it("rejects payload with non-numeric version", () => {
    expect(() =>
      deserializeProject({
        format: "shader-playground",
        version: "v1",
        graph: { nodes: [], edges: [] },
      }),
    ).toThrow(/version is missing/);
  });

  it("rejects payload with malformed graph (missing edges array)", () => {
    expect(() =>
      deserializeProject({
        format: "shader-playground",
        version: 1,
        graph: { nodes: [] },
      }),
    ).toThrow(/missing or malformed/);
  });

  it("emits a validation warning for missing_node edges", () => {
    const restored = deserializeProject({
      format: "shader-playground",
      version: 1,
      graph: {
        nodes: [{ id: "real", kind: "output" }],
        edges: [
          {
            id: "e1",
            source: "real",
            sourceHandle: "out",
            target: "ghost",
            targetHandle: "in",
          },
        ],
      },
      positions: {},
    });
    expect(restored.warnings.some((w) => w.includes("Validation"))).toBe(true);
  });

  it("round-trips param / math / swizzle / combine / image / output nodes", () => {
    const graph: Graph = {
      nodes: [
        {
          id: "img",
          kind: "image",
          assetId: "asset-1",
        },
        {
          id: "img-null",
          kind: "image",
          assetId: null,
        },
        {
          id: "p1",
          kind: "param",
          paramKind: "float",
          value: 0.5,
          label: "Intensity",
        },
        {
          id: "p2",
          kind: "param",
          paramKind: "vec3",
          value: [0.1, 0.2, 0.3],
          // no label — exercises the conditional spread
        },
        { id: "m1", kind: "math", op: "add", a: 1, b: 2 },
        { id: "sw1", kind: "swizzle", mask: "yzx" },
        {
          id: "cb1",
          kind: "combine",
          arity: 4,
          values: [0.1, 0.2, 0.3, 0.4],
        },
        { id: "out1", kind: "output" },
      ],
      edges: [],
    };
    const round = deserializeProject(
      JSON.parse(JSON.stringify(serializeProject(graph, {}))),
    );
    expect(round.graph.nodes.map((n) => n.id).sort()).toEqual(
      graph.nodes.map((n) => n.id).sort(),
    );
    const param1 = round.graph.nodes.find((n) => n.id === "p1");
    expect(param1?.kind).toBe("param");
    if (param1?.kind === "param") {
      expect(param1.label).toBe("Intensity");
      expect(param1.value).toBe(0.5);
    }
    const param2 = round.graph.nodes.find((n) => n.id === "p2");
    if (param2?.kind === "param") {
      expect(param2.label).toBeUndefined();
      expect(param2.value).toEqual([0.1, 0.2, 0.3]);
    }
    const cb = round.graph.nodes.find((n) => n.id === "cb1");
    if (cb?.kind === "combine") {
      expect(cb.values).toEqual([0.1, 0.2, 0.3, 0.4]);
    }
  });
});
