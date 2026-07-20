import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ComputeGraphNode,
  MeshGraphNode,
  ShaderGraphNode,
} from "../core/graph/types";
import { startCodeAutoOpen } from "./codeAutoOpen";
import { useDockStore } from "./dockStore";
import { createDefaultDockTree, findTabLeafPath, getNodeAt } from "./dockTree";
import { useEditorStore } from "./editorStore";
import { useGraphStore } from "./graphStore";
import { useSelectionStore } from "./selectionStore";

const shaderNode: ShaderGraphNode = {
  id: "shader1",
  kind: "shader",
  vertexSource: "void main(){ gl_Position = vec4(0); }",
  fragmentSource: "void main(){}",
  uniformValues: {},
};

const computeNode: ComputeGraphNode = {
  id: "compute1",
  kind: "compute",
  vertexSource: "void main(){}",
  count: 16,
  primitive: "POINTS",
  attributes: [
    { inName: "a_position", outName: "v_position", size: 3, seed: "zero" },
  ],
  uniformValues: {},
};

const meshNode: MeshGraphNode = {
  id: "mesh1",
  kind: "mesh",
  primitive: "cube",
};

/** code leaf의 collapsed 여부를 트리에서 직접 읽는다(findTabLeafPath +
 * getNodeAt). leaf가 트리에 없으면(패널이 닫힘) undefined. */
function codeCollapsed(): boolean | undefined {
  const { tree } = useDockStore.getState();
  if (tree === null) return undefined;
  const path = findTabLeafPath(tree, "code");
  if (path === null) return undefined;
  const node = getNodeAt(tree, path);
  if (node === null || node.type !== "leaf") return undefined;
  return Boolean(node.collapsed);
}

describe("codeAutoOpen — W5 노드 선택 → Code 자동 접기/펼침", () => {
  let unsub: (() => void) | null = null;

  beforeEach(() => {
    useDockStore.setState({
      tree: createDefaultDockTree(),
      maximized: null,
      nextLeafId: 5,
    });
    useSelectionStore.setState({ selectedNodeIds: [], selectedNodeId: null });
    useEditorStore.setState({ autoCode: true });
    useGraphStore.setState({ nodes: [shaderNode, computeNode, meshNode] });
    unsub = startCodeAutoOpen();
  });

  afterEach(() => {
    unsub?.();
    unsub = null;
  });

  it("shader 선택 시 code leaf가 펼쳐진다", () => {
    useDockStore.getState().setCollapsed("code", true);
    useSelectionStore.getState().setSelectedIds(["shader1"]);
    expect(codeCollapsed()).toBe(false);
  });

  it("compute 선택 시 code leaf가 펼쳐진다", () => {
    useDockStore.getState().setCollapsed("code", true);
    useSelectionStore.getState().setSelectedIds(["compute1"]);
    expect(codeCollapsed()).toBe(false);
  });

  it("code-editable이 아닌 노드(mesh) 선택 시 code leaf가 접힌다", () => {
    useSelectionStore.getState().setSelectedIds(["mesh1"]);
    expect(codeCollapsed()).toBe(true);
  });

  it("선택 해제(null)는 직전 펼침 상태를 그대로 둔다", () => {
    useSelectionStore.getState().setSelectedIds(["shader1"]);
    expect(codeCollapsed()).toBe(false);
    useSelectionStore.getState().select(null);
    expect(codeCollapsed()).toBe(false);
  });

  it("선택 해제(null)는 직전 접힘 상태를 그대로 둔다", () => {
    useSelectionStore.getState().setSelectedIds(["mesh1"]);
    expect(codeCollapsed()).toBe(true);
    useSelectionStore.getState().select(null);
    expect(codeCollapsed()).toBe(true);
  });

  it("autoCode OFF면 선택이 code leaf를 구동하지 않는다(no-op)", () => {
    useEditorStore.getState().setAutoCode(false);
    useDockStore.getState().setCollapsed("code", false);
    useSelectionStore.getState().setSelectedIds(["mesh1"]);
    expect(codeCollapsed()).toBe(false);
  });

  it("다중 선택 — code-editable kind가 하나라도 있으면 펼쳐진다", () => {
    useDockStore.getState().setCollapsed("code", true);
    useSelectionStore.getState().setSelectedIds(["mesh1", "shader1"]);
    expect(codeCollapsed()).toBe(false);
  });

  it("다중 선택 — code-editable kind가 없으면 접힌다", () => {
    useDockStore.getState().setCollapsed("code", false);
    useSelectionStore.getState().setSelectedIds(["mesh1"]);
    expect(codeCollapsed()).toBe(true);
  });

  it("code 탭이 닫혀 있으면 예외 없이 no-op", () => {
    useDockStore.getState().closeTab("code");
    expect(() => {
      useSelectionStore.getState().setSelectedIds(["shader1"]);
    }).not.toThrow();
    expect(codeCollapsed()).toBeUndefined();
  });

  it("수동으로 접은 뒤 같은 노드를 재선택하면 선택이 수동보다 우선해 다시 펼쳐진다(W5-a)", () => {
    useSelectionStore.getState().setSelectedIds(["shader1"]);
    expect(codeCollapsed()).toBe(false);

    const path = findTabLeafPath(useDockStore.getState().tree, "code");
    expect(path).not.toBeNull();
    if (path !== null) useDockStore.getState().toggleCollapsed(path);
    expect(codeCollapsed()).toBe(true);

    useSelectionStore.getState().setSelectedIds(["shader1"]);
    expect(codeCollapsed()).toBe(false);
  });
});
