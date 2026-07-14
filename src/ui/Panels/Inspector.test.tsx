import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GraphNode, ShaderGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { Inspector } from "./Inspector";

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

const shaderNode: ShaderGraphNode = {
  id: "s1",
  kind: "shader",
  vertexSource: "",
  fragmentSource: "uniform float u_a;",
  uniformValues: {},
};

// "output" nodes have no fields beyond BaseNode, so a bare literal typed as
// GraphNode satisfies the union without importing the (unexported)
// OutputGraphNode member type.
const otherNode: GraphNode = { id: "o1", kind: "output" };

describe("Inspector (smoke)", () => {
  it("renders one auto-generated uniform row with a slider control and the AUTO badge", () => {
    useGraphStore.getState().addNode(shaderNode);
    render(<Inspector embedded />);

    expect(screen.getAllByTestId("uniform-row")).toHaveLength(1);
    const row = screen.getByTestId("uniform-row");
    expect(row.getAttribute("data-uniform-name")).toBe("u_a");
    expect(row.getAttribute("data-uniform-control")).toBe("slider");
    expect(screen.getByText("AUTO")).not.toBeNull();
  });

  it("shows the empty-search state when the query matches nothing", () => {
    useGraphStore.getState().addNode(shaderNode);
    render(<Inspector embedded />);

    fireEvent.change(screen.getByTestId("uniform-search"), {
      target: { value: "zzz" },
    });
    expect(screen.getByTestId("uniform-search-empty")).not.toBeNull();
    expect(screen.queryByTestId("uniform-row")).toBeNull();
  });

  it("shows the multi-select banner when 2+ nodes are selected", () => {
    useGraphStore.getState().addNode(shaderNode);
    useGraphStore.getState().addNode(otherNode);
    useSelectionStore.getState().setSelectedIds(["s1", "o1"]);
    render(<Inspector embedded />);

    expect(screen.getByTestId("multi-select-banner").textContent).toContain(
      "nodes selected",
    );
  });
});
