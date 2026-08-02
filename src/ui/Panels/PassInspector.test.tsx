import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComputeGraphNode, ShaderGraphNode } from "../../core/graph/types";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useGraphStore } from "../../state/graphStore";
import type { ComputePassRow, ShaderPassRow } from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { PassInspector } from "./PassInspector";

const initialGraph = useGraphStore.getState();
const initialPassPlan = usePassPlanStore.getState();
const initialGpuTimer = useGpuTimerStore.getState();

function shaderNode(id: string, name: string): ShaderGraphNode {
  return {
    id,
    kind: "shader",
    name,
    vertexSource: "",
    fragmentSource: "",
    uniformValues: {},
  };
}

function computeNode(id: string, name: string): ComputeGraphNode {
  return {
    id,
    kind: "compute",
    name,
    vertexSource: "",
    count: 1024,
    primitive: "POINTS",
    attributes: [],
    uniformValues: {},
  };
}

function computeRow(
  nodeId: string,
  getRead: () => "A" | "B" = () => "A",
): ComputePassRow {
  return {
    kind: "compute",
    nodeId,
    count: 1024,
    primitiveLabel: "POINTS",
    getRead,
  };
}

function shaderRow(
  overrides: Partial<ShaderPassRow> & { nodeId: string },
): ShaderPassRow {
  return {
    kind: "shader",
    width: 1920,
    height: 1080,
    resolutionScale: 1,
    meshIsFullscreen: true,
    meshLabel: "fullscreen quad",
    meshComputeNodeId: null,
    samplers: [],
    meshAttributeUse: [],
    silentWarnings: [],
    ...overrides,
  };
}

function resetStores() {
  useGraphStore.setState(initialGraph, true);
  usePassPlanStore.setState(initialPassPlan, true);
  useGpuTimerStore.setState(initialGpuTimer, true);
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
  vi.useRealTimers();
});

describe("PassInspector", () => {
  it("shows the empty state when there are no passes", () => {
    render(<PassInspector />);
    expect(
      screen.getByText("no passes — compile a shader node first"),
    ).not.toBeNull();
    expect(screen.queryAllByTestId("pass-row")).toHaveLength(0);
    expect(screen.queryAllByTestId("pass-state-note")).toHaveLength(0);
  });

  it("renders rows in plan order with correct kind/FBO/mesh/sampler cells", () => {
    useGraphStore.setState({
      nodes: [
        computeNode("compute1", "Particles"),
        shaderNode("noise1", "Noise"),
        shaderNode("blur1", "Blur"),
      ],
    });
    usePassPlanStore.getState().publish(
      [
        computeRow("compute1"),
        shaderRow({ nodeId: "noise1" }),
        shaderRow({
          nodeId: "blur1",
          width: 960,
          height: 540,
          resolutionScale: 0.5,
          meshIsFullscreen: false,
          meshLabel: "",
          samplers: [{ uniformName: "u_tex", sourceNodeId: "noise1", unit: 0 }],
        }),
      ],
      {},
    );

    render(<PassInspector />);

    const rows = screen.getAllByTestId("pass-row");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute("data-node-id"))).toEqual([
      "compute1",
      "noise1",
      "blur1",
    ]);

    const row0 = rows[0];
    const row1 = rows[1];
    const row2 = rows[2];
    if (!row0 || !row1 || !row2) throw new Error("expected 3 rows");

    expect(row0.textContent).toContain("Particles");
    expect(row0.textContent).toContain("compute");
    expect(row0.querySelector('[data-testid="pass-fbo"]')?.textContent).toBe(
      "—",
    );
    expect(row0.querySelector('[data-testid="pass-mesh"]')?.textContent).toBe(
      "POINTS ×1024, read=A",
    );
    expect(row0.querySelector('[data-testid="pass-state"]')?.textContent).toBe(
      "—",
    );

    expect(row1.textContent).toContain("Noise");
    expect(row1.querySelector('[data-testid="pass-mesh"]')?.textContent).toBe(
      "fullscreen quad",
    );
    expect(row1.querySelector('[data-testid="pass-fbo"]')?.textContent).toBe(
      "1920×1080 (1×)",
    );
    // noise1: meshIsFullscreen true → depth off.
    expect(row1.querySelector('[data-testid="pass-state"]')?.textContent).toBe(
      "blend off · cull off · depth off",
    );

    expect(row2.querySelector('[data-testid="pass-fbo"]')?.textContent).toBe(
      "960×540 (0.5×)",
    );
    expect(
      row2.querySelector('[data-testid="pass-samplers"]')?.textContent,
    ).toBe("u_tex ← Noise (unit 0)");
    // blur1: meshIsFullscreen false → depth on.
    expect(row2.querySelector('[data-testid="pass-state"]')?.textContent).toBe(
      "blend off · cull off · depth on",
    );

    expect(screen.getByTestId("pass-state-note").textContent).toContain(
      "outColor.a",
    );
  });

  it("gives the compute row's State cell an explanatory title, no title on shader rows", () => {
    useGraphStore.setState({
      nodes: [computeNode("compute1", "Particles"), shaderNode("s1", "S1")],
    });
    usePassPlanStore
      .getState()
      .publish([computeRow("compute1"), shaderRow({ nodeId: "s1" })], {});

    render(<PassInspector />);
    const rows = screen.getAllByTestId("pass-row");
    const computeState = rows[0]?.querySelector('[data-testid="pass-state"]');
    const shaderState = rows[1]?.querySelector('[data-testid="pass-state"]');
    expect(computeState?.getAttribute("title")).toBe(
      "compute pass: transform feedback only — no fragment stage",
    );
    expect(shaderState?.hasAttribute("title")).toBe(false);
  });

  it("resolves a shader row's compute-driven mesh via the driving ComputePassRow", () => {
    useGraphStore.setState({
      nodes: [
        computeNode("compute1", "Particles"),
        shaderNode("draw1", "Draw"),
      ],
    });
    usePassPlanStore.getState().publish(
      [
        computeRow("compute1", () => "B"),
        shaderRow({
          nodeId: "draw1",
          meshIsFullscreen: false,
          meshLabel: "",
          meshComputeNodeId: "compute1",
        }),
      ],
      {},
    );

    render(<PassInspector />);
    const meshCell = screen
      .getAllByTestId("pass-row")[1]
      ?.querySelector('[data-testid="pass-mesh"]');
    expect(meshCell?.textContent).toBe("POINTS ×1024, read=B");
  });

  it('falls back to "compute" when the driving ComputePassRow is missing', () => {
    useGraphStore.setState({ nodes: [shaderNode("draw1", "Draw")] });
    usePassPlanStore.getState().publish(
      [
        shaderRow({
          nodeId: "draw1",
          meshIsFullscreen: false,
          meshLabel: "",
          meshComputeNodeId: "ghost-compute",
        }),
      ],
      {},
    );

    render(<PassInspector />);
    const meshCell = screen
      .getByTestId("pass-row")
      .querySelector('[data-testid="pass-mesh"]');
    expect(meshCell?.textContent).toBe("compute");
  });

  it("falls back to the raw node id for a row whose node has been deleted", () => {
    useGraphStore.setState({ nodes: [] });
    usePassPlanStore
      .getState()
      .publish([shaderRow({ nodeId: "deleted1" })], {});

    render(<PassInspector />);
    expect(screen.getByTestId("pass-row").textContent).toContain("deleted1");
  });

  it('renders "—" in the GPU ms column when the timer extension is unsupported', () => {
    useGraphStore.setState({ nodes: [shaderNode("noise1", "Noise")] });
    usePassPlanStore.getState().publish([shaderRow({ nodeId: "noise1" })], {});
    useGpuTimerStore.setState({
      supported: false,
      enabled: true,
      byNode: { noise1: 0.42 },
    });

    render(<PassInspector />);
    expect(screen.getByTestId("pass-gpu").textContent).toBe("—");
  });

  it('renders "—" in the GPU ms column when the timer is disabled', () => {
    useGraphStore.setState({ nodes: [shaderNode("noise1", "Noise")] });
    usePassPlanStore.getState().publish([shaderRow({ nodeId: "noise1" })], {});
    useGpuTimerStore.setState({
      supported: true,
      enabled: false,
      byNode: { noise1: 0.42 },
    });

    render(<PassInspector />);
    expect(screen.getByTestId("pass-gpu").textContent).toBe("—");
  });

  it("renders the formatted GPU ms when supported and enabled", () => {
    useGraphStore.setState({ nodes: [shaderNode("noise1", "Noise")] });
    usePassPlanStore.getState().publish([shaderRow({ nodeId: "noise1" })], {});
    useGpuTimerStore.setState({
      supported: true,
      enabled: true,
      byNode: { noise1: 0.4231 },
    });

    render(<PassInspector />);
    expect(screen.getByTestId("pass-gpu").textContent).toBe("0.42");
  });

  it("polls the live compute read side every 250ms while mounted, without any store publish", () => {
    vi.useFakeTimers();
    useGraphStore.setState({ nodes: [computeNode("compute1", "Particles")] });
    let read: "A" | "B" = "A";
    const rows = [computeRow("compute1", () => read)];
    usePassPlanStore.getState().publish(rows, {});

    render(<PassInspector />);
    expect(screen.getByTestId("pass-mesh").textContent).toBe(
      "POINTS ×1024, read=A",
    );

    read = "B";
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByTestId("pass-mesh").textContent).toBe(
      "POINTS ×1024, read=B",
    );
    // The polling re-render must not have re-published a new rows array —
    // the same closure-carrying row objects are still in the store.
    expect(usePassPlanStore.getState().rows).toBe(rows);
  });
});
