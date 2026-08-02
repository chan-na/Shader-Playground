import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MeshGraphNode } from "../../core/graph/types";
import { useAssetStore } from "../../state/assetStore";
import { useGraphStore } from "../../state/graphStore";
import type { ShaderPassRow } from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { MeshInspectorSection } from "./MeshInspectorSection";

const initialAsset = useAssetStore.getState();
const initialGraph = useGraphStore.getState();
const initialPassPlan = usePassPlanStore.getState();

function resetStores() {
  useAssetStore.setState(initialAsset, true);
  useGraphStore.setState(initialGraph, true);
  usePassPlanStore.setState(initialPassPlan, true);
}

afterEach(() => {
  cleanup();
  resetStores();
});

function shaderRowFixture(overrides: Partial<ShaderPassRow>): ShaderPassRow {
  return {
    kind: "shader",
    nodeId: "s1",
    width: 100,
    height: 100,
    resolutionScale: 1,
    meshIsFullscreen: false,
    meshLabel: "cube",
    meshComputeNodeId: null,
    samplers: [],
    meshAttributeUse: [],
    silentWarnings: [],
    ...overrides,
  };
}

const meshNode: MeshGraphNode = {
  id: "m1",
  kind: "mesh",
  primitive: "cube",
  assetId: null,
};
const meshEdge = {
  id: "e1",
  source: "m1",
  sourceHandle: "mesh",
  target: "s1",
  targetHandle: "mesh",
};

describe("MeshInspectorSection — attribute status markers [B-2]", () => {
  it("marks consumed / skipped / unknown per attribute (aggregated over the connected consumer)", () => {
    useGraphStore.setState({ edges: [meshEdge] });
    usePassPlanStore.getState().publish(
      [
        shaderRowFixture({
          meshAttributeUse: [
            { name: "a_position", size: 3, consumed: true },
            { name: "a_normal", size: 3, consumed: false },
            // a_uv intentionally absent: no consumer even names it, so it
            // must read "unknown", never "skipped".
          ],
        }),
      ],
      {},
    );

    render(<MeshInspectorSection node={meshNode} />);

    const section = screen.getByTestId("mesh-attributes");
    const position = section.querySelector('[data-attr-name="a_position"]');
    const normal = section.querySelector('[data-attr-name="a_normal"]');
    const uv = section.querySelector('[data-attr-name="a_uv"]');

    expect(position?.getAttribute("data-attr-status")).toBe("consumed");
    expect(normal?.getAttribute("data-attr-status")).toBe("skipped");
    expect(uv?.getAttribute("data-attr-status")).toBe("unknown");

    expect(position?.textContent).toContain("✓");
    expect(normal?.textContent).toContain("제공되지만 미선언(스킵됨)");
    expect(uv?.textContent).not.toContain("✓");
    expect(uv?.textContent).not.toContain("스킵됨");
  });

  it("marks every attribute unknown when nothing consumes this mesh", () => {
    render(<MeshInspectorSection node={meshNode} />);

    const section = screen.getByTestId("mesh-attributes");
    for (const name of ["a_position", "a_normal", "a_uv"]) {
      const row = section.querySelector(`[data-attr-name="${name}"]`);
      expect(row?.getAttribute("data-attr-status")).toBe("unknown");
      expect(row?.textContent).not.toContain("✓");
      expect(row?.textContent).not.toContain("스킵됨");
    }
  });
});
