import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GroupGraphNode, MeshGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { GroupInspector } from "./GroupInspector";

function resetStores() {
  useGraphStore.getState().reset();
  useSelectionStore.getState().select(null);
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  cleanup();
  resetStores();
});

function groupNode(overrides: Partial<GroupGraphNode> = {}): GroupGraphNode {
  return {
    id: "g1",
    kind: "group",
    label: "Lighting",
    width: 300,
    height: 200,
    ...overrides,
  };
}

describe("GroupInspector", () => {
  it("typing in the label input calls setGroupLabel", () => {
    const node = groupNode();
    useGraphStore.getState().addNode(node);
    render(<GroupInspector node={node} />);

    fireEvent.change(screen.getByTestId("group-label-input"), {
      target: { value: "Renamed" },
    });

    const updated = useGraphStore
      .getState()
      .nodes.find((n) => n.id === "g1") as GroupGraphNode;
    expect(updated.label).toBe("Renamed");
  });

  it("changing the native color input calls setGroupColor", () => {
    const node = groupNode();
    useGraphStore.getState().addNode(node);
    render(<GroupInspector node={node} />);

    const input = screen.getByTestId("group-color-input") as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("color");
    fireEvent.change(input, { target: { value: "#336699" } });

    const updated = useGraphStore
      .getState()
      .nodes.find((n) => n.id === "g1") as GroupGraphNode;
    expect(updated.color).toBe("#336699");
  });

  it("preserves the group-* testid surface (inspector, label, color, ungroup, cascade)", () => {
    const node = groupNode();
    useGraphStore.getState().addNode(node);
    render(<GroupInspector node={node} />);

    expect(screen.getByTestId("group-inspector")).not.toBeNull();
    expect(screen.getByTestId("group-label-input")).not.toBeNull();
    expect(screen.getByTestId("group-color-input")).not.toBeNull();
    expect(screen.getByTestId("group-ungroup")).not.toBeNull();
    expect(screen.getByTestId("group-delete-cascade")).not.toBeNull();
  });

  it("Delete with children… shows the confirm box; confirming removes the group + children and clears selection", () => {
    const mesh: MeshGraphNode = {
      id: "m1",
      kind: "mesh",
      primitive: "sphere",
    };
    const node = groupNode();
    useGraphStore.getState().addNode(node);
    useGraphStore.getState().addNode(mesh);
    useGraphStore.getState().setParent("m1", "g1");
    useSelectionStore.getState().select("g1");

    render(<GroupInspector node={node} />);

    expect(screen.queryByTestId("group-delete-confirm")).toBeNull();
    fireEvent.click(screen.getByTestId("group-delete-cascade"));

    const confirmBox = screen.getByTestId("group-delete-confirm");
    expect(confirmBox).not.toBeNull();
    const confirmOk = screen.getByTestId("group-delete-confirm-ok");
    expect(confirmOk).not.toBeNull();

    fireEvent.click(confirmOk);

    const nodeIds = useGraphStore.getState().nodes.map((n) => n.id);
    expect(nodeIds).not.toContain("g1");
    expect(nodeIds).not.toContain("m1");
    expect(useSelectionStore.getState().selectedNodeId).toBeNull();
  });
});
