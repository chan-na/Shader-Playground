import { beforeEach, describe, expect, it } from "vitest";
import { computeNode, meshNode, shaderNode } from "../../core/graph/testNodes";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { currentEditorNodeId, pickEditorNodeId } from "./editorNode";

const mesh = meshNode("mesh1");
const compute = computeNode("compute1");

beforeEach(() => {
  useGraphStore.setState({ nodes: [], edges: [], positions: {}, parents: {} });
  useSelectionStore.getState().select(null);
});

describe("pickEditorNodeId", () => {
  it("returns the primary selection when there is one", () => {
    expect(
      pickEditorNodeId("compute1", [mesh, compute, shaderNode("s1")]),
    ).toBe("compute1");
  });

  it("falls back to the FIRST shader node when nothing is selected", () => {
    expect(
      pickEditorNodeId(null, [
        mesh,
        shaderNode("s1"),
        compute,
        shaderNode("s2"),
      ]),
    ).toBe("s1");
  });

  it("returns null when nothing is selected and the graph has no shader", () => {
    expect(pickEditorNodeId(null, [mesh, compute])).toBeNull();
  });

  it("returns null for an empty graph", () => {
    expect(pickEditorNodeId(null, [])).toBeNull();
  });

  it("does not second-guess a selection that is not in the node list", () => {
    // The editor's own lookup handles the stale-id case (it renders the
    // "no shader node selected" placeholder); this helper only decides which
    // id to look up, so it must not silently retarget the first shader.
    expect(pickEditorNodeId("ghost", [shaderNode("s1")])).toBe("ghost");
  });
});

describe("currentEditorNodeId", () => {
  it("reads the same rule off the live stores (selection wins)", () => {
    useGraphStore.setState({ nodes: [shaderNode("s1"), shaderNode("s2")] });
    useSelectionStore.getState().select("s2");
    expect(currentEditorNodeId()).toBe("s2");
  });

  it("agrees with the editor's unselected fallback (#10)", () => {
    useGraphStore.setState({
      nodes: [mesh, shaderNode("s1"), shaderNode("s2")],
    });
    useSelectionStore.getState().select(null);
    expect(currentEditorNodeId()).toBe("s1");
  });

  it("is null when no shader node exists and nothing is selected", () => {
    useGraphStore.setState({ nodes: [mesh] });
    expect(currentEditorNodeId()).toBeNull();
  });
});
