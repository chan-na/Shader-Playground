import { describe, expect, it } from "vitest";
import {
  applyPortRename,
  pruneDeadEdges,
  pruneEdgesForNode,
} from "./edgePrune";
import type {
  CombineGraphNode,
  ComputeGraphNode,
  GraphEdge,
  MathGraphNode,
  ShaderGraphNode,
} from "./types";

const shader = (frag: string): ShaderGraphNode => ({
  id: "s1",
  kind: "shader",
  vertexSource: "void main(){ gl_Position = vec4(0); }",
  fragmentSource: frag,
  uniformValues: {},
});

const edge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): GraphEdge => ({ id, source, sourceHandle, target, targetHandle });

const FRAG_BOTH = `precision highp float;
uniform float u_a;
uniform sampler2D u_tex;
void main(){}`;

const FRAG_ONLY_A = `precision highp float;
uniform float u_a;
void main(){}`;

describe("pruneEdgesForNode", () => {
  it("keeps every edge when the ports still exist", () => {
    const edges = [
      edge("e1", "p1", "value", "s1", "u_a"),
      edge("e2", "img1", "texture", "s1", "u_tex"),
      edge("e3", "s1", "texture", "o1", "texture"),
    ];
    expect(pruneEdgesForNode(shader(FRAG_BOTH), edges)).toBe(edges);
  });

  it("drops the edge into a uniform that was deleted", () => {
    const edges = [
      edge("e1", "p1", "value", "s1", "u_a"),
      edge("e2", "img1", "texture", "s1", "u_tex"),
      edge("e3", "s1", "texture", "o1", "texture"),
    ];
    const kept = pruneEdgesForNode(shader(FRAG_ONLY_A), edges);
    expect(kept.map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  it("drops the edge into the old name when a uniform is renamed", () => {
    const edges = [edge("e1", "p1", "value", "s1", "u_a")];
    const renamed = shader(`precision highp float;
uniform float u_intensity;
void main(){}`);
    expect(pruneEdgesForNode(renamed, edges)).toEqual([]);
  });

  it("never touches edges belonging to other nodes", () => {
    const edges = [
      edge("e1", "p1", "value", "s2", "u_gone"),
      edge("e2", "s2", "texture", "o1", "texture"),
    ];
    expect(pruneEdgesForNode(shader(FRAG_ONLY_A), edges)).toBe(edges);
  });

  it("keeps the implicit mesh port, which no uniform declares", () => {
    const edges = [edge("e1", "m1", "mesh", "s1", "mesh")];
    expect(pruneEdgesForNode(shader(FRAG_ONLY_A), edges)).toBe(edges);
  });

  it("drops `b` when a Math node switches to a unary op", () => {
    const unary: MathGraphNode = {
      id: "m1",
      kind: "math",
      op: "sin",
      a: 0,
      b: 0,
    };
    const edges = [
      edge("e1", "p1", "value", "m1", "a"),
      edge("e2", "p2", "value", "m1", "b"),
    ];
    expect(pruneEdgesForNode(unary, edges).map((e) => e.id)).toEqual(["e1"]);
  });

  it("drops the channels above a lowered Combine arity", () => {
    const combine: CombineGraphNode = {
      id: "c1",
      kind: "combine",
      arity: 2,
      values: [0, 0, 0, 0],
    };
    const edges = [
      edge("e1", "p1", "value", "c1", "x"),
      edge("e2", "p2", "value", "c1", "y"),
      edge("e3", "p3", "value", "c1", "z"),
      edge("e4", "p4", "value", "c1", "w"),
    ];
    expect(pruneEdgesForNode(combine, edges).map((e) => e.id)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("prunes a ComputeNode's uniform ports from its vertex source", () => {
    const compute: ComputeGraphNode = {
      id: "cp1",
      kind: "compute",
      vertexSource: "uniform float u_speed;\nvoid main(){}",
      count: 16,
      primitive: "POINTS",
      attributes: [],
      uniformValues: {},
    };
    const edges = [
      edge("e1", "p1", "value", "cp1", "u_speed"),
      edge("e2", "p2", "value", "cp1", "u_gravity"),
    ];
    expect(pruneEdgesForNode(compute, edges).map((e) => e.id)).toEqual(["e1"]);
  });

  it("drops an edge leaving a port the node no longer outputs", () => {
    const combine: CombineGraphNode = {
      id: "c1",
      kind: "combine",
      arity: 3,
      values: [0, 0, 0, 0],
    };
    const edges = [
      edge("e1", "c1", "value", "s1", "u_a"),
      edge("e2", "c1", "stale", "s1", "u_b"),
    ];
    expect(pruneEdgesForNode(combine, edges).map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("applyPortRename", () => {
  const FRAG_RENAMED = `precision highp float;
uniform float u_intensity;
uniform sampler2D u_tex;
void main(){}`;

  it("moves the edge onto the new name when a uniform is renamed", () => {
    const edges = [
      edge("e1", "p1", "value", "s1", "u_a"),
      edge("e2", "img1", "texture", "s1", "u_tex"),
    ];
    const out = applyPortRename(shader(FRAG_BOTH), shader(FRAG_RENAMED), edges);
    expect(out.rename).toEqual({ from: "u_a", to: "u_intensity" });
    expect(out.edges.map((e) => e.targetHandle)).toEqual([
      "u_intensity",
      "u_tex",
    ]);
    // Only the renamed port's edge is rewritten — the rest keep identity.
    expect(out.edges[1]).toBe(edges[1]);
  });

  it("reports the rename even when no edge pointed at the port", () => {
    // The caller still has to migrate `uniformValues` under the new key.
    const out = applyPortRename(shader(FRAG_BOTH), shader(FRAG_RENAMED), []);
    expect(out.rename).toEqual({ from: "u_a", to: "u_intensity" });
  });

  it("leaves edges alone when nothing was renamed", () => {
    const edges = [edge("e1", "p1", "value", "s1", "u_a")];
    const out = applyPortRename(shader(FRAG_BOTH), shader(FRAG_BOTH), edges);
    expect(out.rename).toBeNull();
    expect(out.edges).toBe(edges);
  });

  it("treats a deleted uniform as a deletion, not a rename", () => {
    const edges = [edge("e1", "p1", "value", "s1", "u_a")];
    const out = applyPortRename(shader(FRAG_BOTH), shader(FRAG_ONLY_A), edges);
    expect(out.rename).toBeNull();
  });

  it("refuses to guess when the renamed slot changed type", () => {
    const before = shader(`precision highp float;
uniform float u_a;
void main(){}`);
    const after = shader(`precision highp float;
uniform vec3 u_b;
void main(){}`);
    expect(applyPortRename(before, after, []).rename).toBeNull();
  });

  it("refuses to guess when two slots moved at once", () => {
    const before = shader(`precision highp float;
uniform float u_a;
uniform float u_b;
void main(){}`);
    const after = shader(`precision highp float;
uniform float u_x;
uniform float u_y;
void main(){}`);
    expect(applyPortRename(before, after, []).rename).toBeNull();
  });

  it("refuses to read a reorder as a rename", () => {
    const before = shader(`precision highp float;
uniform float u_a;
uniform float u_b;
void main(){}`);
    const after = shader(`precision highp float;
uniform float u_b;
uniform float u_a;
void main(){}`);
    expect(applyPortRename(before, after, []).rename).toBeNull();
  });

  it("honours an exact hint from the rename refactor", () => {
    const edges = [edge("e1", "p1", "value", "s1", "u_a")];
    const out = applyPortRename(
      shader(FRAG_BOTH),
      shader(FRAG_RENAMED),
      edges,
      { from: "u_a", to: "u_intensity" },
    );
    expect(out.rename).toEqual({ from: "u_a", to: "u_intensity" });
    expect(out.edges[0]?.targetHandle).toBe("u_intensity");
  });

  it("ignores a hint the port surface does not corroborate", () => {
    // F2 on a local/varying rewrites source without touching any port. Trusting
    // the pair blindly would drag the edge of a uniform sharing the old name.
    const edges = [edge("e1", "p1", "value", "s1", "u_a")];
    const out = applyPortRename(shader(FRAG_BOTH), shader(FRAG_BOTH), edges, {
      from: "u_a",
      to: "vLocal",
    });
    expect(out.rename).toBeNull();
    expect(out.edges).toBe(edges);
  });
});

describe("pruneDeadEdges", () => {
  const graphNodes = [
    shader(FRAG_BOTH),
    { id: "p1", kind: "param", paramKind: "float", value: 0 } as const,
  ];

  it("returns the same array when every edge is live", () => {
    const edges = [edge("e1", "p1", "value", "s1", "u_a")];
    const out = pruneDeadEdges([...graphNodes], edges);
    expect(out.edges).toBe(edges);
    expect(out.dropped).toEqual([]);
  });

  it("drops an edge into a port the node no longer exposes", () => {
    const edges = [
      edge("e1", "p1", "value", "s1", "u_a"),
      edge("e2", "p1", "value", "s1", "u_gone"),
    ];
    const out = pruneDeadEdges([...graphNodes], edges);
    expect(out.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(out.dropped).toEqual([
      { edge: edges[1], nodeId: "s1", handle: "u_gone" },
    ]);
  });

  it("drops an edge leaving a port the node no longer outputs", () => {
    const edges = [edge("e1", "p1", "stale", "s1", "u_a")];
    const out = pruneDeadEdges([...graphNodes], edges);
    expect(out.edges).toEqual([]);
    expect(out.dropped[0]?.handle).toBe("stale");
  });

  it("keeps edges whose node is missing entirely", () => {
    // `validateGraph` reports those as `missing_node`; the load path warns
    // about that class rather than deleting it.
    const edges = [edge("e1", "ghost", "value", "s1", "u_a")];
    const out = pruneDeadEdges([...graphNodes], edges);
    expect(out.edges).toBe(edges);
    expect(out.dropped).toEqual([]);
  });
});
