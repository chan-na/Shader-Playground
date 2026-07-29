import { describe, expect, it } from "vitest";
import type {
  GroupGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import { GROUP_COLLAPSED_HEIGHT } from "../../core/graph/types";
import { createNodeDataCache, groupBoxHeight } from "./rfNodeData";

function paramNode(id: string): ParamGraphNode {
  return { id, kind: "param", paramKind: "float", value: 0 };
}

describe("groupBoxHeight", () => {
  const group = (patch: Partial<GroupGraphNode> = {}): GroupGraphNode => ({
    id: "g1",
    kind: "group",
    label: "G",
    width: 400,
    height: 300,
    ...patch,
  });

  it("returns the stored height for an expanded group", () => {
    expect(groupBoxHeight(group())).toBe(300);
    expect(groupBoxHeight(group({ collapsed: false }))).toBe(300);
  });

  it("returns the header height for a collapsed group", () => {
    // [#37] The drop-target math used the stored `height` for the node being
    // dragged, so a collapsed group's "center" sat ~135px below its visible
    // 30px header and reparented against whatever was under that empty point.
    expect(groupBoxHeight(group({ collapsed: true }))).toBe(
      GROUP_COLLAPSED_HEIGHT,
    );
  });

  it("ignores the stored height entirely while collapsed", () => {
    expect(groupBoxHeight(group({ collapsed: true, height: 2000 }))).toBe(
      GROUP_COLLAPSED_HEIGHT,
    );
  });
});

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
