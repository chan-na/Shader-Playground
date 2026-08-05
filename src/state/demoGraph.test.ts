import { describe, expect, it } from "vitest";
import type { ParentsMap } from "../core/graph/parents";
import type {
  Graph,
  GraphNodeKind,
  ShaderGraphNode,
} from "../core/graph/types";
import { topologicalOrder, validateGraph } from "../core/graph/validate";
import { NODE_META } from "../core/nodes/registry";
import {
  CHAIN_DEMO_LAYOUT,
  CHAIN_DEMO_PARENTS,
  createChainDemoGraph,
  createDemoGraph,
  createParticleDemoGraph,
  createSplitDemoGraph,
  createTorusDemoGraph,
  DEMO_LAYOUT,
  DEMO_PARENTS,
  PARTICLE_DEMO_LAYOUT,
  PARTICLE_DEMO_PARENTS,
  SPLIT_DEMO_LAYOUT,
  SPLIT_DEMO_PARENTS,
  TORUS_DEMO_LAYOUT,
  TORUS_DEMO_PARENTS,
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

/** Count of each functional (non-group) node kind, order-independent. */
function kindCounts(graph: Graph): Partial<Record<GraphNodeKind, number>> {
  const out: Partial<Record<GraphNodeKind, number>> = {};
  for (const n of graph.nodes) {
    if (n.kind === "group") continue;
    out[n.kind] = (out[n.kind] ?? 0) + 1;
  }
  return out;
}

// F-2 (T3): every demo now carries lesson Group nodes + a parents map.
// Parametrized across all 5 factories so the same invariants (group-before-
// children ordering, parents pointing at real groups, unchanged functional
// node composition, non-empty labels) are pinned once instead of five times.
// `groupLabels` is the step copy itself — the whole payload of the feature,
// so it is asserted verbatim rather than merely "non-empty".
const DEMOS: Array<{
  name: string;
  factory: () => Graph;
  parents: ParentsMap;
  expectedKinds: Partial<Record<GraphNodeKind, number>>;
  groupLabels: string[];
}> = [
  {
    name: "sphere",
    factory: createDemoGraph,
    parents: DEMO_PARENTS,
    expectedKinds: { mesh: 1, shader: 1, output: 1 },
    groupLabels: [
      "1 · Mesh — 정점 데이터 (a_position·a_normal·a_uv)",
      "2 · Shader — vertex+fragment가 메시를 그린다",
      "3 · Output — 최종 텍스처를 캔버스로",
    ],
  },
  {
    name: "torus",
    factory: createTorusDemoGraph,
    parents: TORUS_DEMO_PARENTS,
    expectedKinds: { mesh: 1, shader: 1, output: 1 },
    groupLabels: [
      "1 · Mesh — torus 정점 데이터, a_uv가 표면을 감싼다",
      "2 · Shader — UV Debug: v_uv를 그대로 색으로 출력",
      "3 · Output — 최종 텍스처를 캔버스로",
    ],
  },
  {
    name: "chain",
    factory: createChainDemoGraph,
    parents: CHAIN_DEMO_PARENTS,
    expectedKinds: { shader: 3, output: 1 },
    groupLabels: [
      "1 · Generate — mesh 없음 → fullscreen quad",
      "2 · Filter — 이전 패스 FBO를 u_tex로 샘플",
      "3 · Display",
    ],
  },
  {
    name: "split",
    factory: createSplitDemoGraph,
    parents: SPLIT_DEMO_PARENTS,
    expectedKinds: { shader: 3, output: 3 },
    groupLabels: [
      "파이프라인 — noise → blur → tonemap",
      "각 단계를 Output으로 분기 — 화면 3분할",
    ],
  },
  {
    name: "particle",
    factory: createParticleDemoGraph,
    parents: PARTICLE_DEMO_PARENTS,
    expectedKinds: { compute: 1, shader: 1, output: 1 },
    groupLabels: [
      "1 · Compute — transform feedback ping-pong (A/B)",
      "2 · Render — 파티클 버퍼를 POINTS로",
    ],
  },
];

describe.each(DEMOS)("learnability lesson groups (T3/F-2) — $name", ({
  factory,
  parents,
  expectedKinds,
  groupLabels,
}) => {
  const graph = factory();
  const groupIds = new Set(
    graph.nodes.filter((n) => n.kind === "group").map((n) => n.id),
  );

  it("still passes validation with groups present", () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it("has at least one lesson group", () => {
    expect(groupIds.size).toBeGreaterThan(0);
  });

  it("every group precedes its children in the nodes array (RF nesting requirement)", () => {
    const indexOf = new Map(graph.nodes.map((n, i) => [n.id, i]));
    for (const [childId, groupId] of Object.entries(parents)) {
      const groupIdx = indexOf.get(groupId);
      const childIdx = indexOf.get(childId);
      expect(groupIdx).toBeDefined();
      expect(childIdx).toBeDefined();
      expect(groupIdx as number).toBeLessThan(childIdx as number);
    }
  });

  it("every parents value references a real group node in this graph", () => {
    for (const groupId of Object.values(parents)) {
      expect(groupIds.has(groupId)).toBe(true);
    }
  });

  it("every parents key references a real node in this graph", () => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const childId of Object.keys(parents)) {
      expect(nodeIds.has(childId)).toBe(true);
    }
  });

  it("functional (non-group) node kind composition is unchanged", () => {
    expect(kindCounts(graph)).toEqual(expectedKinds);
  });

  it("every group has a non-empty label", () => {
    for (const n of graph.nodes) {
      if (n.kind !== "group") continue;
      expect(n.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries the exact step copy on its groups, in group order", () => {
    // The labels *are* the lesson — "non-empty" above leaves the entire
    // payload free to drift (renumbering, a dropped step, an English
    // rewrite), so pin the strings themselves.
    const labels: string[] = [];
    for (const n of graph.nodes) {
      if (n.kind !== "group") continue;
      labels.push(n.label);
    }
    expect(labels).toEqual(groupLabels);
  });
});
