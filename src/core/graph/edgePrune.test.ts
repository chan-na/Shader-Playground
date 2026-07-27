import { describe, expect, it } from "vitest";
import { pruneEdgesForNode } from "./edgePrune";
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
