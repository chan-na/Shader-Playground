import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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

const groupNode: GraphNode = {
  id: "g1",
  kind: "group",
  label: "My Group",
  width: 200,
  height: 120,
};

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

  // D15: the "· editing <id>" fragment used to render the raw node id. It
  // should show the primary (last-selected) node's display name instead.
  it("shows the primary node's display name, not its raw id, in the multi-select banner", () => {
    useGraphStore.getState().addNode(shaderNode);
    useGraphStore.getState().addNode(otherNode);
    useGraphStore.getState().renameNode("o1", "Final Composite");
    useSelectionStore.getState().setSelectedIds(["s1", "o1"]);
    render(<Inspector embedded />);

    const banner = screen.getByTestId("multi-select-banner");
    expect(banner.textContent).toContain("Final Composite");
    expect(banner.textContent).not.toContain("o1");
  });
});

// D15: the common Name field. Same store source (node.name / renameNode) as
// the node card header's inline rename — see NodeCardHeader.tsx.
describe("Inspector — Name field (D15)", () => {
  it("renders for a selected shader node with the fallback label as placeholder", () => {
    useGraphStore.getState().addNode(shaderNode);
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    const input = screen.getByTestId("node-name-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Shader");
  });

  it("commits the draft to the store on Enter", () => {
    useGraphStore.getState().addNode(shaderNode);
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    const input = screen.getByTestId("node-name-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Blur pass" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(
      useGraphStore.getState().nodes.find((n) => n.id === "s1")?.name,
    ).toBe("Blur pass");
  });

  it("commits the draft to the store on blur", () => {
    useGraphStore.getState().addNode(shaderNode);
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    const input = screen.getByTestId("node-name-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Blur pass" } });
    fireEvent.blur(input);

    expect(
      useGraphStore.getState().nodes.find((n) => n.id === "s1")?.name,
    ).toBe("Blur pass");
  });

  it("does not render for a selected group node", () => {
    useGraphStore.getState().addNode(groupNode);
    useSelectionStore.getState().select("g1");
    render(<Inspector embedded />);

    expect(screen.queryByTestId("node-name-input")).toBeNull();
  });

  it("reflects a rename made through the store (card-side rename) after a remount key change", () => {
    useGraphStore.getState().addNode(shaderNode);
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    act(() => {
      useGraphStore.getState().renameNode("s1", "Renamed via card");
    });

    expect(
      (screen.getByTestId("node-name-input") as HTMLInputElement).value,
    ).toBe("Renamed via card");
  });
});
