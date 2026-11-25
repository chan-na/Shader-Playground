import { describe, expect, it } from "vitest";
import { meshNode, paramNode, shaderNode } from "../../core/graph/testNodes";
import type { GraphEdge, GraphNode } from "../../core/graph/types";
import { tokens } from "../../theme";
import { type EdgeVisualStyle, edgeStyleFor } from "./edgeTheme";

// The shader declares only `u_x`, so an edge into `u_y` is an orphan.
const nodes: GraphNode[] = [
  meshNode("mesh1", { assetId: null }),
  paramNode("param1", { value: 0.5 }),
  shaderNode("shader1", { fragmentSource: "uniform float u_x;" }),
];

describe("edgeStyleFor", () => {
  it("(a) mesh -> shader mesh-in: valid edge, resource family, solid 2.5", () => {
    const edge: GraphEdge = {
      id: "e1",
      source: "mesh1",
      sourceHandle: "mesh",
      target: "shader1",
      targetHandle: "mesh",
    };
    const style: EdgeVisualStyle = edgeStyleFor(edge, nodes);
    expect(style).toEqual({
      stroke: tokens.portFamily.resource,
      strokeWidth: 2.5,
    });
  });

  it("(b) param(float) -> shader float uniform: valid edge, scalar family", () => {
    const edge: GraphEdge = {
      id: "e2",
      source: "param1",
      sourceHandle: "value",
      target: "shader1",
      targetHandle: "u_x",
    };
    const style = edgeStyleFor(edge, nodes);
    expect(style).toEqual({
      stroke: tokens.portFamily.scalar,
      strokeWidth: 2.5,
    });
  });

  it("(c) target uniform removed from shader source: orphan edge -> semantic.error dashed", () => {
    // shader1's fragmentSource only declares u_x — u_y is a stale target
    // handle left over from an edit that deleted the uniform declaration.
    const edge: GraphEdge = {
      id: "e3",
      source: "param1",
      sourceHandle: "value",
      target: "shader1",
      targetHandle: "u_y",
    };
    const style = edgeStyleFor(edge, nodes);
    expect(style).toEqual({
      stroke: tokens.semantic.error,
      strokeWidth: 2.5,
      strokeDasharray: "5 5",
    });
  });

  it("(d) source node not found: muted fallback", () => {
    const edge: GraphEdge = {
      id: "e4",
      source: "missing-node",
      sourceHandle: "value",
      target: "shader1",
      targetHandle: "u_x",
    };
    const style = edgeStyleFor(edge, nodes);
    expect(style).toEqual({ stroke: tokens.text.muted, strokeWidth: 2.5 });
  });

  it("(e) a valid edge's style has no strokeDasharray key at all (exactOptionalPropertyTypes guard)", () => {
    const edge: GraphEdge = {
      id: "e1",
      source: "mesh1",
      sourceHandle: "mesh",
      target: "shader1",
      targetHandle: "mesh",
    };
    const style = edgeStyleFor(edge, nodes);
    expect("strokeDasharray" in style).toBe(false);
  });
});
