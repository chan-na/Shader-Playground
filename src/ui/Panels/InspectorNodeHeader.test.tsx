import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ParamGraphNode, ShaderGraphNode } from "../../core/graph/types";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { tokens } from "../../theme";
import { InspectorNodeHeader } from "./InspectorNodeHeader";

// design-refactor's DockPanelHeader.test.tsx pattern: snapshot the store once
// and restore it wholesale before every test, so setSample/setEnabled/etc.
// from one test never leak into the next.
const initialGpuTimerState = useGpuTimerStore.getState();

beforeEach(() => {
  useGpuTimerStore.setState(initialGpuTimerState, true);
});

afterEach(() => {
  cleanup();
});

/** jsdom's CSSStyleDeclaration normalizes hex colors to rgb() on read-back
 * (verified empirically), so token-hex assertions have to go through the
 * same conversion rather than string-matching the "#rrggbb" literal. */
function hexToRgbString(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const shaderNode: ShaderGraphNode = {
  id: "s1",
  kind: "shader",
  vertexSource: "",
  fragmentSource: "",
  uniformValues: {},
};

const paramNode: ParamGraphNode = {
  id: "p1",
  kind: "param",
  paramKind: "color",
  value: [1, 0, 0],
  label: "Accent",
};

describe("InspectorNodeHeader", () => {
  it("renders the shader glyph, category border color, title, and meta", () => {
    render(<InspectorNodeHeader node={shaderNode} />);

    const glyph = screen.getByText("◆");
    expect(glyph.style.borderColor).toBe(
      hexToRgbString(tokens.nodeCategory.process),
    );

    expect(screen.getByTestId("insp-node-title").textContent).toBe("shader");
    expect(screen.getByText("process · s1")).not.toBeNull();
  });

  it("shows the node's label as the title for a param node", () => {
    render(<InspectorNodeHeader node={paramNode} />);
    expect(screen.getByTestId("insp-node-title").textContent).toBe("Accent");
    expect(screen.getByText("value · p1 · kind color")).not.toBeNull();
  });

  it("shows the type chip with the node kind", () => {
    render(<InspectorNodeHeader node={paramNode} />);
    expect(screen.getByTestId("insp-node-kind-chip").textContent).toBe("param");
  });

  describe("GPU ms chip", () => {
    it("is absent when the timer store has no sample for this node", () => {
      render(<InspectorNodeHeader node={shaderNode} />);
      expect(screen.queryByTestId("insp-gpu-ms-s1")).toBeNull();
    });

    it("is absent when supported/enabled but no sample landed yet", () => {
      useGpuTimerStore.setState({ supported: true, enabled: true });
      render(<InspectorNodeHeader node={shaderNode} />);
      expect(screen.queryByTestId("insp-gpu-ms-s1")).toBeNull();
    });

    it("renders '<ms> ms' once supported, enabled, and a sample landed", () => {
      useGpuTimerStore.setState({
        supported: true,
        enabled: true,
        byNode: { s1: 1.2345 },
      });
      render(<InspectorNodeHeader node={shaderNode} />);
      const chip = screen.getByTestId("insp-gpu-ms-s1");
      expect(chip.textContent).toBe("1.23 ms");
    });

    it("is absent when disabled even with a sample present", () => {
      useGpuTimerStore.setState({
        supported: true,
        enabled: false,
        byNode: { s1: 1.2345 },
      });
      render(<InspectorNodeHeader node={shaderNode} />);
      expect(screen.queryByTestId("insp-gpu-ms-s1")).toBeNull();
    });
  });
});
