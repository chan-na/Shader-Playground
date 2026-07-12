import { describe, expect, it } from "vitest";
import type { ParamGraphNode, ShaderGraphNode } from "../../core/graph/types";
import { createNodeDataCache } from "./rfNodeData";

function paramNode(id: string): ParamGraphNode {
  return { id, kind: "param", paramKind: "float", value: 0 };
}

describe("createNodeDataCache", () => {
  it("wraps a node as { node }", () => {
    const dataFor = createNodeDataCache();
    const n = paramNode("p1");
    expect(dataFor(n)).toEqual({ node: n });
    expect(dataFor(n).node).toBe(n);
  });

  it("returns the same data reference for the same node object", () => {
    const dataFor = createNodeDataCache();
    const n = paramNode("p1");
    const first = dataFor(n);
    const second = dataFor(n);
    // Stable identity is the whole point: React Flow skips re-render when
    // `data` keeps its reference across renders.
    expect(second).toBe(first);
  });

  it("returns a new data reference when the node object is replaced", () => {
    const dataFor = createNodeDataCache();
    const n1 = paramNode("p1");
    const n2: ParamGraphNode = { ...n1, value: 42 };
    const first = dataFor(n1);
    const second = dataFor(n2);
    expect(second).not.toBe(first);
    expect(second.node).toBe(n2);
  });

  it("keeps a stable node's wrapper stable even after other nodes change", () => {
    const dataFor = createNodeDataCache();
    const stable = paramNode("p1");
    const before = dataFor(stable);
    // A different node cycling through does not disturb `stable`'s wrapper.
    const other1: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {},
    };
    dataFor(other1);
    dataFor({ ...other1, fragmentSource: "changed" });
    expect(dataFor(stable)).toBe(before);
  });

  it("tracks multiple nodes independently", () => {
    const dataFor = createNodeDataCache();
    const a = paramNode("a");
    const b = paramNode("b");
    const dataA = dataFor(a);
    const dataB = dataFor(b);
    expect(dataA).not.toBe(dataB);
    expect(dataFor(a)).toBe(dataA);
    expect(dataFor(b)).toBe(dataB);
  });
});
