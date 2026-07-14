import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ParamGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { ParamInspector } from "./ParamInspector";

function resetStore() {
  useGraphStore.getState().reset();
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  cleanup();
  resetStore();
});

function floatNode(overrides: Partial<ParamGraphNode> = {}): ParamGraphNode {
  return {
    id: "p1",
    kind: "param",
    paramKind: "float",
    value: 0.5,
    ...overrides,
  };
}

describe("ParamInspector", () => {
  describe("float", () => {
    it("renders one range input and one number input", () => {
      const node = floatNode();
      useGraphStore.getState().addNode(node);
      const { container } = render(<ParamInspector node={node} />);
      expect(container.querySelectorAll("input[type='range']")).toHaveLength(1);
      expect(container.querySelectorAll("input[type='number']")).toHaveLength(
        1,
      );
    });

    it("changing the range input updates graphStore via setParamValue", () => {
      const node = floatNode();
      useGraphStore.getState().addNode(node);
      render(<ParamInspector node={node} />);

      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "1.25" },
      });

      const updated = useGraphStore
        .getState()
        .nodes.find((n) => n.id === "p1") as ParamGraphNode;
      expect(updated.value).toBe(1.25);
    });
  });

  describe("vec3", () => {
    it("renders 3 range inputs for the MultiSlider", () => {
      const node = floatNode({ paramKind: "vec3", value: [0.1, 0.2, 0.3] });
      useGraphStore.getState().addNode(node);
      const { container } = render(<ParamInspector node={node} />);
      expect(container.querySelectorAll("input[type='range']")).toHaveLength(3);
    });
  });

  describe("color", () => {
    it("changing the native color input calls setParamValue with an rgb array", () => {
      const node = floatNode({ paramKind: "color", value: [1, 0, 0] });
      useGraphStore.getState().addNode(node);
      const { container } = render(<ParamInspector node={node} />);

      const input = container.querySelector(
        "input[type='color']",
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "#00ff00" } });

      const updated = useGraphStore
        .getState()
        .nodes.find((n) => n.id === "p1") as ParamGraphNode;
      const [r, g, b] = updated.value as number[];
      expect(r).toBeCloseTo(0, 2);
      expect(g).toBeCloseTo(1, 2);
      expect(b).toBeCloseTo(0, 2);
    });
  });

  describe("label", () => {
    it("typing in the label TextField calls setParamLabel", () => {
      const node = floatNode();
      useGraphStore.getState().addNode(node);
      render(<ParamInspector node={node} />);

      fireEvent.change(screen.getByPlaceholderText("Param float"), {
        target: { value: "Wobble" },
      });

      const updated = useGraphStore
        .getState()
        .nodes.find((n) => n.id === "p1") as ParamGraphNode;
      expect(updated.label).toBe("Wobble");
    });
  });

  describe("time", () => {
    it("falls back to [1, 0] and renders 2 range + 2 number inputs", () => {
      const node = floatNode({ paramKind: "time", value: [1, 0] });
      useGraphStore.getState().addNode(node);
      const { container } = render(<ParamInspector node={node} />);
      expect(container.querySelectorAll("input[type='range']")).toHaveLength(2);
      expect(container.querySelectorAll("input[type='number']")).toHaveLength(
        2,
      );
    });
  });

  it("renders the Output type chip with the node's paramKind", () => {
    const node = floatNode({ paramKind: "vec3", value: [0, 0, 0] });
    useGraphStore.getState().addNode(node);
    render(<ParamInspector node={node} />);
    expect(screen.getByText("Output type")).not.toBeNull();
    expect(screen.getByText("vec3")).not.toBeNull();
  });
});
