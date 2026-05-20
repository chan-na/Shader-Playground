import { describe, expect, it } from "vitest";
import type { Graph } from "./types";
import { topologicalOrder, validateGraph } from "./validate";

const shader = (id: string) => ({
  id,
  kind: "shader" as const,
  vertexSource: "",
  fragmentSource: "",
  uniformValues: {},
});
const mesh = (id: string) => ({
  id,
  kind: "mesh" as const,
  primitive: "cube" as const,
});
const out = (id: string) => ({ id, kind: "output" as const });

describe("validateGraph", () => {
  it("passes for empty graph", () => {
    expect(validateGraph({ nodes: [], edges: [] })).toEqual([]);
  });

  it("flags more than 4 Output nodes", () => {
    const g: Graph = {
      nodes: [out("o1"), out("o2"), out("o3"), out("o4"), out("o5")],
      edges: [],
    };
    const errors = validateGraph(g);
    expect(errors.some((e) => e.code === "multiple_outputs")).toBe(true);
  });

  it("allows up to 4 Output nodes (split viewport)", () => {
    const g: Graph = {
      nodes: [shader("s1"), out("o1"), out("o2"), out("o3"), out("o4")],
      edges: [],
    };
    expect(validateGraph(g).filter((e) => e.code !== "missing_node")).toEqual(
      [],
    );
  });

  it("flags N:1 multi-input edges", () => {
    const g: Graph = {
      nodes: [shader("a"), shader("b"), shader("c")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "texture",
          target: "c",
          targetHandle: "u_tex",
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "texture",
          target: "c",
          targetHandle: "u_tex",
        },
      ],
    };
    const errors = validateGraph(g);
    expect(errors.some((e) => e.code === "multi_input")).toBe(true);
  });

  it("allows N:1 fan-in across distinct target handles", () => {
    // multi_input is scoped per (target, targetHandle): three sources feeding
    // three different sampler handles on one shader is a valid composite.
    const g: Graph = {
      nodes: [shader("a"), shader("b"), shader("c"), shader("dst")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "texture",
          target: "dst",
          targetHandle: "u_a",
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "texture",
          target: "dst",
          targetHandle: "u_b",
        },
        {
          id: "e3",
          source: "c",
          sourceHandle: "texture",
          target: "dst",
          targetHandle: "u_c",
        },
      ],
    };
    expect(validateGraph(g)).toEqual([]);
  });

  it("detects cycles", () => {
    const g: Graph = {
      nodes: [shader("a"), shader("b")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "texture",
          target: "b",
          targetHandle: "u_tex",
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "texture",
          target: "a",
          targetHandle: "u_tex",
        },
      ],
    };
    expect(validateGraph(g).some((e) => e.code === "cycle")).toBe(true);
  });

  it("flags edges referencing missing nodes", () => {
    const g: Graph = {
      nodes: [shader("a")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "texture",
          target: "ghost",
          targetHandle: "u_tex",
        },
      ],
    };
    expect(validateGraph(g).some((e) => e.code === "missing_node")).toBe(true);
  });

  it("1:N fanout is allowed", () => {
    const g: Graph = {
      nodes: [shader("a"), shader("b"), shader("c")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "texture",
          target: "b",
          targetHandle: "u_tex",
        },
        {
          id: "e2",
          source: "a",
          sourceHandle: "texture",
          target: "c",
          targetHandle: "u_tex",
        },
      ],
    };
    expect(validateGraph(g)).toEqual([]);
  });
});

describe("topologicalOrder", () => {
  it("orders nodes so sources precede sinks", () => {
    const g: Graph = {
      nodes: [shader("c"), shader("a"), shader("b"), out("o")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "texture",
          target: "b",
          targetHandle: "u_tex",
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "texture",
          target: "c",
          targetHandle: "u_tex",
        },
        {
          id: "e3",
          source: "c",
          sourceHandle: "texture",
          target: "o",
          targetHandle: "texture",
        },
      ],
    };
    const order = topologicalOrder(g).map((n) => n.id);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("o"));
  });

  it("orders all fan-in sources before the composite sink", () => {
    // Three sources feeding distinct sampler handles on one shader must all
    // precede it so their FBOs are rendered before the composite samples them.
    const g: Graph = {
      nodes: [shader("dst"), shader("a"), shader("b"), shader("c"), out("o")],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "texture",
          target: "dst",
          targetHandle: "u_a",
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "texture",
          target: "dst",
          targetHandle: "u_b",
        },
        {
          id: "e3",
          source: "c",
          sourceHandle: "texture",
          target: "dst",
          targetHandle: "u_c",
        },
        {
          id: "e4",
          source: "dst",
          sourceHandle: "texture",
          target: "o",
          targetHandle: "texture",
        },
      ],
    };
    const order = topologicalOrder(g).map((n) => n.id);
    const dstIdx = order.indexOf("dst");
    expect(order.indexOf("a")).toBeLessThan(dstIdx);
    expect(order.indexOf("b")).toBeLessThan(dstIdx);
    expect(order.indexOf("c")).toBeLessThan(dstIdx);
    expect(dstIdx).toBeLessThan(order.indexOf("o"));
  });

  it("handles disconnected nodes", () => {
    const g: Graph = {
      nodes: [shader("a"), mesh("m")],
      edges: [],
    };
    const order = topologicalOrder(g)
      .map((n) => n.id)
      .sort();
    expect(order).toEqual(["a", "m"]);
  });
});
