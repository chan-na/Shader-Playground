import { beforeEach, describe, expect, it } from "vitest";
import type { ComputeGraphNode, ShaderGraphNode } from "../core/graph/types";
import { useGraphStore } from "./graphStore";

const makeShader = (id: string, frag = "void main(){}"): ShaderGraphNode => ({
  id,
  kind: "shader",
  vertexSource: "void main(){ gl_Position = vec4(0); }",
  fragmentSource: frag,
  uniformValues: {},
});

describe("graphStore", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it("starts empty", () => {
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it("addNode appends and bumps rev", () => {
    const before = useGraphStore.getState().rev;
    useGraphStore.getState().addNode(makeShader("n1"), { x: 10, y: 20 });
    const after = useGraphStore.getState();
    expect(after.nodes).toHaveLength(1);
    expect(after.positions.n1).toEqual({ x: 10, y: 20 });
    expect(after.rev).toBe(before + 1);
  });

  it("removeNode also removes connected edges", () => {
    const s = useGraphStore.getState();
    s.addNode({ id: "a", kind: "mesh", primitive: "cube" });
    s.addNode(makeShader("b"));
    s.addEdge({
      id: "e1",
      source: "a",
      sourceHandle: "mesh",
      target: "b",
      targetHandle: "mesh",
    });
    expect(useGraphStore.getState().edges).toHaveLength(1);

    useGraphStore.getState().removeNode("a");
    expect(useGraphStore.getState().nodes).toHaveLength(1);
    expect(useGraphStore.getState().edges).toHaveLength(0);
  });

  it("updateShaderSource patches vertex/fragment sources", () => {
    useGraphStore.getState().addNode(makeShader("s1", "A"));
    useGraphStore.getState().updateShaderSource("s1", { fragmentSource: "B" });
    const node = useGraphStore.getState().nodes[0] as ShaderGraphNode;
    expect(node.fragmentSource).toBe("B");
  });

  it("setUniformValue bumps uniformRev not rev", () => {
    useGraphStore.getState().addNode(makeShader("s1"));
    const before = useGraphStore.getState();
    useGraphStore.getState().setUniformValue("s1", "u_intensity", 0.5);
    const after = useGraphStore.getState();
    expect((after.nodes[0] as ShaderGraphNode).uniformValues.u_intensity).toBe(
      0.5,
    );
    expect(after.uniformRev).toBe(before.uniformRev + 1);
    expect(after.rev).toBe(before.rev);
  });

  it("updateComputeSource patches vertexSource and bumps rev (Phase 13)", () => {
    const cn: ComputeGraphNode = {
      id: "c1",
      kind: "compute",
      vertexSource: "void main(){}",
      count: 16,
      primitive: "POINTS",
      attributes: [
        { inName: "a_position", outName: "v_position", size: 3, seed: "zero" },
      ],
      uniformValues: {},
    };
    useGraphStore.getState().addNode(cn);
    const before = useGraphStore.getState();
    useGraphStore.getState().updateComputeSource("c1", "// new vertex source");
    const after = useGraphStore.getState();
    expect((after.nodes[0] as ComputeGraphNode).vertexSource).toBe(
      "// new vertex source",
    );
    expect(after.rev).toBe(before.rev + 1);
  });

  it("setComputeConfig patches count/primitive/attributes (Phase 13)", () => {
    const cn: ComputeGraphNode = {
      id: "c1",
      kind: "compute",
      vertexSource: "",
      count: 16,
      primitive: "POINTS",
      attributes: [
        { inName: "a_position", outName: "v_position", size: 3, seed: "zero" },
      ],
      uniformValues: {},
    };
    useGraphStore.getState().addNode(cn);
    useGraphStore
      .getState()
      .setComputeConfig("c1", { count: 512, primitive: "LINES" });
    const updated = useGraphStore
      .getState()
      .nodes.find((n) => n.id === "c1") as ComputeGraphNode;
    expect(updated.count).toBe(512);
    expect(updated.primitive).toBe("LINES");
  });

  it("removeEdge removes only the named edge", () => {
    const s = useGraphStore.getState();
    s.addEdge({
      id: "e1",
      source: "a",
      sourceHandle: "o",
      target: "b",
      targetHandle: "i",
    });
    s.addEdge({
      id: "e2",
      source: "a",
      sourceHandle: "o",
      target: "c",
      targetHandle: "i",
    });
    useGraphStore.getState().removeEdge("e1");
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(["e2"]);
  });
});
