import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ComputeGraphNode,
  GraphNode,
  ImageGraphNode,
  MeshGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { useMouseStore } from "../../state/mouseStore";
import type {
  NodeVaryingRow,
  NodeVaryings,
  ShaderPassRow,
} from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { useRendererStore } from "../../state/rendererStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useTimeStore } from "../../state/timeStore";
import { Inspector } from "./Inspector";

function resetStores() {
  useGraphStore.getState().reset();
  useSelectionStore.getState().select(null);
  usePassPlanStore.getState().reset();
  useTimeStore.getState().reset();
  useMouseStore.getState().reset();
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

const otherGroupNode: GraphNode = {
  id: "g2",
  kind: "group",
  label: "Second Group",
  width: 200,
  height: 120,
};

/** A second shader declaring the *same* uniform name as `shaderNode`. */
const otherShaderNode: ShaderGraphNode = { ...shaderNode, id: "s2" };

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

  // [A-2] The Name field is now common to every kind, groups included — it
  // used to be suppressed for groups, which left them with a separate "Group
  // label" field. It seeds from the group's `label` and commits back into it.
  it("renders for a selected group node, seeded from the group's label", () => {
    useGraphStore.getState().addNode(groupNode);
    useSelectionStore.getState().select("g1");
    render(<Inspector embedded />);

    const input = screen.getByTestId("node-name-input") as HTMLInputElement;
    expect(input.value).toBe(groupNode.label);

    fireEvent.change(input, { target: { value: "Lighting" } });
    fireEvent.blur(input);

    const group = useGraphStore.getState().nodes.find((n) => n.id === "g1");
    expect(group?.kind === "group" && group.label).toBe("Lighting");
    // The rename must not leave a second title on the node.
    expect(group?.name).toBeUndefined();
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

  // [#35] Seed, Escape-revert and the remount key must all read the same
  // field. Escape used to revert to `node.name ?? ""`, which for a group is
  // always "" — abandoning an edit blanked the field of a group that has a
  // perfectly good `label`.
  it("Escape reverts a group's draft to its label, not to blank", () => {
    useGraphStore.getState().addNode(groupNode);
    useSelectionStore.getState().select("g1");
    render(<Inspector embedded />);

    const input = screen.getByTestId("node-name-input") as HTMLInputElement;
    expect(input.value).toBe("My Group");

    fireEvent.change(input, { target: { value: "Half-typed name" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("My Group");
  });

  it("Escape still reverts a non-group draft to its name", () => {
    useGraphStore.getState().addNode(shaderNode);
    useGraphStore.getState().renameNode("s1", "Blur pass");
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    const input = screen.getByTestId("node-name-input") as HTMLInputElement;
    expect(input.value).toBe("Blur pass");

    fireEvent.change(input, { target: { value: "Half-typed name" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("Blur pass");
  });
});

// [#8] The open-hint-editor marker used to be the bare uniform name, which is
// not unique across nodes.
describe("Inspector — hint editor is scoped to the owning node (#8)", () => {
  it("closes the editor when a different node with the same uniform name is selected", () => {
    useGraphStore.getState().addNode(shaderNode);
    useGraphStore.getState().addNode(otherShaderNode);
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    fireEvent.click(screen.getByTestId("uniform-edit-toggle"));
    expect(screen.getByTestId("uniform-hint-editor")).not.toBeNull();

    act(() => {
      useSelectionStore.getState().select("s2");
    });
    // s2 declares u_a too — it must not inherit s1's open editor.
    expect(
      screen.getByTestId("uniform-row").getAttribute("data-uniform-name"),
    ).toBe("u_a");
    expect(screen.queryByTestId("uniform-hint-editor")).toBeNull();

    // …and re-selecting s1 brings its own editor back.
    act(() => {
      useSelectionStore.getState().select("s1");
    });
    expect(screen.getByTestId("uniform-hint-editor")).not.toBeNull();
  });

  it("opens for the newly selected node when its own gear is clicked", () => {
    useGraphStore.getState().addNode(shaderNode);
    useGraphStore.getState().addNode(otherShaderNode);
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    fireEvent.click(screen.getByTestId("uniform-edit-toggle"));
    act(() => {
      useSelectionStore.getState().select("s2");
    });
    fireEvent.click(screen.getByTestId("uniform-edit-toggle"));

    expect(screen.getByTestId("uniform-hint-editor")).not.toBeNull();
    // Applying writes to the selected node, not the one the editor was first
    // opened on.
    fireEvent.click(screen.getByTestId("uniform-hint-cancel"));
    expect(screen.queryByTestId("uniform-hint-editor")).toBeNull();
  });
});

// [#25] GroupInspector is rendered unkeyed, so switching groups reuses the
// component instance. A boolean `confirmingDelete` survived the switch and
// left the destructive confirm box armed on a group the user never opened it
// on — only reproducible from the Inspector, not by rendering GroupInspector
// directly.
describe("Inspector — group delete confirmation is per group (#25)", () => {
  it("drops the armed confirm box when another group is selected", () => {
    useGraphStore.getState().addNode(groupNode);
    useGraphStore.getState().addNode(otherGroupNode);
    useSelectionStore.getState().select("g1");
    render(<Inspector embedded />);

    fireEvent.click(screen.getByTestId("group-delete-cascade"));
    expect(screen.getByTestId("group-delete-confirm")).not.toBeNull();

    act(() => {
      useSelectionStore.getState().select("g2");
    });

    expect(
      screen.getByTestId("group-inspector").getAttribute("data-group-id"),
    ).toBe("g2");
    expect(screen.queryByTestId("group-delete-confirm")).toBeNull();
  });

  it("still confirms for the group it was armed on", () => {
    useGraphStore.getState().addNode(groupNode);
    useGraphStore.getState().addNode(otherGroupNode);
    useSelectionStore.getState().select("g1");
    render(<Inspector embedded />);

    fireEvent.click(screen.getByTestId("group-delete-cascade"));
    fireEvent.click(screen.getByTestId("group-delete-confirm-ok"));

    const ids = useGraphStore.getState().nodes.map((n) => n.id);
    expect(ids).not.toContain("g1");
    expect(ids).toContain("g2");
  });
});

/** Finds a single `system-uniform-row` by its `data-uniform-name`, throwing
 *  (rather than a `noUncheckedIndexedAccess`-unsafe `!`) if it's missing. */
function findSystemUniformRow(name: string): HTMLElement {
  const row = screen
    .getAllByTestId("system-uniform-row")
    .find((r) => r.getAttribute("data-uniform-name") === name);
  if (!row) throw new Error(`system-uniform-row not found: ${name}`);
  return row;
}

/** The trailing value span of a `system-uniform-row` — always the row's last
 *  child, and the only place a bare "—" reads as "no value": the description
 *  span in the middle carries an em dash of its own. */
function systemUniformValue(name: string): string {
  const span = findSystemUniformRow(name).lastElementChild;
  if (!span) throw new Error(`system-uniform-row has no value span: ${name}`);
  return span.textContent ?? "";
}

// [C-1] The "System uniforms (auto-bound)" section — binding status mirrors
// `plan.fullscreenByNode` (A-1's publish), never re-derived from the graph.
describe("Inspector — System uniforms section [C-1]", () => {
  const viewShaderNode: ShaderGraphNode = {
    id: "sv1",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "uniform mat4 u_view;",
    uniformValues: {},
  };

  const timeShaderNode: ShaderGraphNode = {
    id: "st1",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "uniform float u_time;",
    uniformValues: {},
  };

  // SystemUniformsSection polls u_time/u_mouse on a 500ms interval rather
  // than subscribing directly (StatusBar.tsx precedent) — fake timers give
  // deterministic control over that tick instead of a real 500ms wait.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks u_view unbound with the fullscreen-pass note when the plan reports this node as fullscreen", () => {
    useGraphStore.getState().addNode(viewShaderNode);
    usePassPlanStore.getState().publish([], { sv1: true }, {});
    useSelectionStore.getState().select("sv1");
    render(<Inspector embedded />);

    const row = findSystemUniformRow("u_view");
    expect(row.getAttribute("data-bound")).toBe("false");
    expect(row.textContent).toContain("not bound (fullscreen pass)");
  });

  it("marks u_view bound once the plan reports a resolved (non-fullscreen) mesh", () => {
    useGraphStore.getState().addNode(viewShaderNode);
    usePassPlanStore.getState().publish([], { sv1: false }, {});
    useSelectionStore.getState().select("sv1");
    render(<Inspector embedded />);

    const row = findSystemUniformRow("u_view");
    expect(row.getAttribute("data-bound")).toBe("true");
    expect(row.textContent).not.toContain("not bound");
  });

  it("samples the current u_time value and refreshes it on the next polling tick", () => {
    useGraphStore.getState().addNode(timeShaderNode);
    useSelectionStore.getState().select("st1");
    useTimeStore.getState().setTime(0);
    render(<Inspector embedded />);

    expect(findSystemUniformRow("u_time").textContent).toContain("0.00s");

    act(() => {
      useTimeStore.getState().setTime(3.5);
      vi.advanceTimersByTime(500);
    });

    expect(findSystemUniformRow("u_time").textContent).toContain("3.50s");
  });
});

// [C-1] The value column of that same section. `u_mouse` and `u_resolution`
// sit one row apart and used to disagree about coordinate space: the mouse
// store holds canvas-framebuffer pixels, but every pass receives them
// rescaled by `pass.width / ctx.width` (execute.ts's `bindSystemUniforms`) —
// which is the space `u_resolution` has always been printed in. A row the
// section itself marks `data-bound="false"` also used to print a live value,
// which reads as "this is what your shader receives" when in fact nothing is
// uploaded for that uniform at all.
describe("Inspector — System uniform values [C-1]", () => {
  const mouseShaderNode: ShaderGraphNode = {
    id: "sm1",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "uniform vec4 u_mouse;",
    uniformValues: {},
  };

  const mouseResShaderNode: ShaderGraphNode = {
    id: "sm2",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "uniform vec4 u_mouse;\nuniform vec2 u_resolution;",
    uniformValues: {},
  };

  const mouseComputeNode: ComputeGraphNode = {
    id: "cm1",
    kind: "compute",
    vertexSource: "uniform vec4 u_mouse;\nuniform float u_time;",
    count: 1024,
    primitive: "POINTS",
    attributes: [],
    uniformValues: {},
  };

  /** Fills in every field `ShaderPassRow` requires; the overrides carry the
   *  pass size under test. Same factory shape as PassInspector.test.tsx. */
  function shaderPassRow(
    overrides: Partial<ShaderPassRow> & { nodeId: string },
  ): ShaderPassRow {
    return {
      kind: "shader",
      width: 800,
      height: 600,
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

  // Same 500ms sampling interval as the [C-1] block above.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // rendererStore has no reset(); put the canvas back at its 1×1 default so
    // the sizes set here cannot leak into the describes below.
    useRendererStore.getState().setCanvasSize({ width: 1, height: 1 });
  });

  it("rescales u_mouse into the pass's own space at resolutionScale < 1", () => {
    useGraphStore.getState().addNode(mouseShaderNode);
    const row = shaderPassRow({
      nodeId: "sm1",
      width: 400,
      height: 300,
      resolutionScale: 0.5,
    });
    usePassPlanStore.getState().publish([row], { sm1: true }, {});
    useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
    useMouseStore.getState().setPosition(800, 600);
    useSelectionStore.getState().select("sm1");
    render(<Inspector embedded />);

    // execute.ts uploads (800·400/800, 600·300/600): the far corner of the
    // *pass*, not the far corner of the canvas.
    expect(systemUniformValue("u_mouse")).toBe("400, 300");
  });

  it("leaves u_mouse unscaled when the pass renders at the full canvas size", () => {
    useGraphStore.getState().addNode(mouseShaderNode);
    const row = shaderPassRow({ nodeId: "sm1", width: 800, height: 600 });
    usePassPlanStore.getState().publish([row], { sm1: true }, {});
    useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
    useMouseStore.getState().setPosition(800, 600);
    useSelectionStore.getState().select("sm1");
    render(<Inspector embedded />);

    expect(systemUniformValue("u_mouse")).toBe("800, 600");
  });

  it("reads u_resolution from the published row, in the same space as the u_mouse row beside it", () => {
    useGraphStore.getState().addNode(mouseResShaderNode);
    const row = shaderPassRow({
      nodeId: "sm2",
      width: 640,
      height: 360,
      resolutionScale: 0.5,
    });
    usePassPlanStore.getState().publish([row], { sm2: true }, {});
    useRendererStore.getState().setCanvasSize({ width: 1280, height: 720 });
    useMouseStore.getState().setPosition(1280, 720);
    useSelectionStore.getState().select("sm2");
    render(<Inspector embedded />);

    expect(systemUniformValue("u_resolution")).toBe("640×360");
    // A pointer at the canvas corner is at the pass corner too, so the two
    // rows have to name the same number — otherwise the reader cannot compute
    // the `u_mouse.xy / u_resolution` the shader actually sees.
    expect(systemUniformValue("u_mouse")).toBe("640, 360");
  });

  it("withholds the value of a row it marks unbound, keeping the bound row's own value", () => {
    useGraphStore.getState().addNode(mouseComputeNode);
    useTimeStore.getState().setTime(1.25);
    useMouseStore.getState().setPosition(800, 600);
    useSelectionStore.getState().select("cm1");
    render(<Inspector embedded />);

    const mouseRow = findSystemUniformRow("u_mouse");
    expect(mouseRow.getAttribute("data-bound")).toBe("false");
    expect(mouseRow.textContent).toContain("not bound (compute pass)");
    // A compute pass uploads no pointer at all, so printing the store's live
    // position beside that note claimed something the program never receives.
    expect(systemUniformValue("u_mouse")).toBe("—");
    expect(mouseRow.textContent).not.toContain("800, 600");

    expect(findSystemUniformRow("u_time").getAttribute("data-bound")).toBe(
      "true",
    );
    expect(systemUniformValue("u_time")).toBe("1.25s");
  });
});

// [B-1] Mesh Inspector section — the mesh-side counterpart to the existing
// Compute "Attributes" block.
describe("Inspector — Mesh section [B-1]", () => {
  const meshNode: MeshGraphNode = {
    id: "mesh1",
    kind: "mesh",
    primitive: "cube",
    assetId: null,
  };

  it("renders the mesh-attributes section with the fixed attribute contract for a primitive mesh", () => {
    useGraphStore.getState().addNode(meshNode);
    useSelectionStore.getState().select("mesh1");
    render(<Inspector embedded />);

    const section = screen.getByTestId("mesh-attributes");
    expect(section.textContent).toContain("verts");
    expect(section.textContent).toContain("idx");
    expect(section.textContent).toContain("TRIANGLES");
    expect(section.textContent).toContain("a_position");
    expect(section.textContent).toContain("(vec3)");
    expect(section.textContent).toContain("a_uv");
    expect(section.textContent).toContain("(vec2)");
  });
});

// [A-2, T4] Varying bridge section — the vertex↔fragment contract, sourced
// from passPlanStore.varyingsByNode (never re-parsed here).
describe("Inspector — Varying bridge section [A-2]", () => {
  const bridgeShaderNode: ShaderGraphNode = {
    id: "vb1",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "uniform float u_a;",
    uniformValues: {},
  };

  const meshNode: MeshGraphNode = {
    id: "vbmesh1",
    kind: "mesh",
    primitive: "cube",
    assetId: null,
  };

  const computeNode: ComputeGraphNode = {
    id: "vbcompute1",
    kind: "compute",
    vertexSource: "",
    count: 1024,
    primitive: "POINTS",
    attributes: [],
    uniformValues: {},
  };

  function seedContract(nodeId: string, rows: NodeVaryingRow[]) {
    const contract: NodeVaryings = { rows, confident: true };
    usePassPlanStore.getState().publish([], {}, { [nodeId]: contract });
  }

  it("shows the bridge section for a selected shader node once a contract is published", () => {
    useGraphStore.getState().addNode(bridgeShaderNode);
    seedContract("vb1", [
      {
        name: "v_uv",
        vertexType: "vec2",
        fragmentType: "vec2",
        fragmentUsed: true,
        status: "linked",
      },
    ]);
    useSelectionStore.getState().select("vb1");
    render(<Inspector embedded />);

    expect(screen.getByTestId("varying-bridge")).not.toBeNull();
    expect(screen.getByTestId("varying-row")).not.toBeNull();
  });

  it("stays visible while an unrelated uniform search query is active", () => {
    useGraphStore.getState().addNode(bridgeShaderNode);
    seedContract("vb1", [
      {
        name: "v_uv",
        vertexType: "vec2",
        fragmentType: "vec2",
        fragmentUsed: true,
        status: "linked",
      },
    ]);
    useSelectionStore.getState().select("vb1");
    render(<Inspector embedded />);

    fireEvent.change(screen.getByTestId("uniform-search"), {
      target: { value: "nonexistent" },
    });

    expect(screen.getByTestId("uniform-search-empty")).not.toBeNull();
    expect(screen.getByTestId("varying-bridge")).not.toBeNull();
  });

  it("is absent for a mesh node", () => {
    useGraphStore.getState().addNode(meshNode);
    useSelectionStore.getState().select("vbmesh1");
    render(<Inspector embedded />);

    expect(screen.queryByTestId("varying-bridge")).toBeNull();
  });

  it("is absent for a compute node even when a contract exists under its id", () => {
    useGraphStore.getState().addNode(computeNode);
    seedContract("vbcompute1", [
      {
        name: "v_pos",
        vertexType: "vec3",
        fragmentType: "vec3",
        fragmentUsed: true,
        status: "linked",
      },
    ]);
    useSelectionStore.getState().select("vbcompute1");
    render(<Inspector embedded />);

    expect(screen.queryByTestId("varying-bridge")).toBeNull();
  });
});

/** Finds a single `uniform-row` by its `data-uniform-name`. */
function findUniformRow(name: string): HTMLElement {
  const row = screen
    .getAllByTestId("uniform-row")
    .find((r) => r.getAttribute("data-uniform-name") === name);
  if (!row) throw new Error(`uniform-row not found: ${name}`);
  return row;
}

// [L1/E-4] A uniform is also an input port — when an edge drives it,
// execute.ts's bindUserUniforms overwrites whatever the Inspector slider
// would send every frame. The control must disable and explain why.
describe("Inspector — driven uniforms (L1/E-4)", () => {
  const drivenShaderNode: ShaderGraphNode = {
    id: "s3",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "uniform float u_x;\nuniform float u_y;",
    uniformValues: {},
  };

  const paramNode: ParamGraphNode = {
    id: "p1",
    kind: "param",
    paramKind: "float",
    value: 0,
  };

  it("marks the driven uniform's row, disables its control, and names the source node — the sibling uniform stays untouched", () => {
    useGraphStore.getState().addNode(drivenShaderNode);
    useGraphStore.getState().addNode(paramNode);
    useGraphStore.getState().renameNode("p1", "Speed Param");
    useGraphStore.getState().addEdge({
      id: "ed1",
      source: "p1",
      sourceHandle: "value",
      target: "s3",
      targetHandle: "u_x",
    });
    useSelectionStore.getState().select("s3");
    render(<Inspector embedded />);

    const rowX = findUniformRow("u_x");
    expect(rowX.getAttribute("data-driven")).toBe("true");
    expect(rowX.textContent).toContain("driven by Speed Param");
    const sliderX = rowX.querySelector(
      "input[type='range']",
    ) as HTMLInputElement;
    expect(sliderX.disabled).toBe(true);

    const rowY = findUniformRow("u_y");
    expect(rowY.getAttribute("data-driven")).toBe("false");
    expect(rowY.textContent).not.toContain("driven by");
    const sliderY = rowY.querySelector(
      "input[type='range']",
    ) as HTMLInputElement;
    expect(sliderY.disabled).toBe(false);
  });

  it("reverts to enabled and drops the note the instant the edge is removed", () => {
    useGraphStore.getState().addNode(drivenShaderNode);
    useGraphStore.getState().addNode(paramNode);
    useGraphStore.getState().addEdge({
      id: "ed1",
      source: "p1",
      sourceHandle: "value",
      target: "s3",
      targetHandle: "u_x",
    });
    useSelectionStore.getState().select("s3");
    render(<Inspector embedded />);

    expect(findUniformRow("u_x").getAttribute("data-driven")).toBe("true");

    act(() => {
      useGraphStore.getState().removeEdge("ed1");
    });

    expect(findUniformRow("u_x").getAttribute("data-driven")).toBe("false");
    expect(screen.queryByTestId("uniform-driven-note")).toBeNull();
    const slider = findUniformRow("u_x").querySelector(
      "input[type='range']",
    ) as HTMLInputElement;
    expect(slider.disabled).toBe(false);
  });

  // A dead edge (source node gone, e.g. mid-undo) must not collapse to an
  // empty label the way displayNodeName's blank-name fallback would.
  it("falls back to the raw edge source id when the driving node no longer exists", () => {
    useGraphStore.getState().addNode(drivenShaderNode);
    useGraphStore.setState((s) => ({
      edges: [
        ...s.edges,
        {
          id: "ed-dead",
          source: "ghost",
          sourceHandle: "value",
          target: "s3",
          targetHandle: "u_x",
        },
      ],
    }));
    useSelectionStore.getState().select("s3");
    render(<Inspector embedded />);

    const row = findUniformRow("u_x");
    expect(row.getAttribute("data-driven")).toBe("true");
    expect(row.textContent).toContain("driven by ghost");
  });

  it("never mutates uniformValues while driven — the store stays untouched", () => {
    useGraphStore.getState().addNode(drivenShaderNode);
    useGraphStore.getState().addNode(paramNode);
    useGraphStore.getState().addEdge({
      id: "ed1",
      source: "p1",
      sourceHandle: "value",
      target: "s3",
      targetHandle: "u_x",
    });
    useSelectionStore.getState().select("s3");
    render(<Inspector embedded />);

    const stored = useGraphStore
      .getState()
      .nodes.find((n) => n.id === "s3") as ShaderGraphNode;
    expect(stored.uniformValues).toEqual({});
  });

  // The hint editor (⚙) edits the source-level annotation, not the live
  // value — it must stay reachable even while the control is driven.
  it("keeps the hint-editor gear reachable while the uniform is driven", () => {
    useGraphStore.getState().addNode(drivenShaderNode);
    useGraphStore.getState().addNode(paramNode);
    useGraphStore.getState().addEdge({
      id: "ed1",
      source: "p1",
      sourceHandle: "value",
      target: "s3",
      targetHandle: "u_x",
    });
    useSelectionStore.getState().select("s3");
    render(<Inspector embedded />);

    const toggle = findUniformRow("u_x").querySelector(
      "[data-testid='uniform-edit-toggle']",
    );
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle as Element);
    expect(screen.getByTestId("uniform-hint-editor")).not.toBeNull();
  });
});

// [E-3] Texture parameters — derived from core/gl/texture.ts's
// FBO_TEXTURE_PARAMS / IMAGE_TEXTURE_PARAMS constants, not hand-copied
// strings, so the two sections can never silently disagree with the GL layer.
describe("Inspector — Texture parameters [E-3]", () => {
  const imageNode: ImageGraphNode = {
    id: "img1",
    kind: "image",
    assetId: null,
  };

  it("shows the Image node's REPEAT/mipmap sampling parameters", () => {
    useGraphStore.getState().addNode(imageNode);
    useSelectionStore.getState().select("img1");
    render(<Inspector embedded />);

    const section = screen.getByTestId("texture-params");
    expect(section.textContent).toContain("REPEAT");
    expect(section.textContent).toContain("LINEAR_MIPMAP_LINEAR");
    expect(section.textContent).toContain("mipmaps: yes");
    expect(section.textContent).toContain("같은 GLSL이 다른 결과");
  });

  it("shows the Shader node's FBO output texture parameters (CLAMP_TO_EDGE, no mipmap)", () => {
    useGraphStore.getState().addNode(shaderNode);
    useSelectionStore.getState().select("s1");
    render(<Inspector embedded />);

    const section = screen.getByTestId("texture-params");
    expect(section.textContent).toContain("Output texture (FBO)");
    expect(section.textContent).toContain("CLAMP_TO_EDGE");
    expect(section.textContent).toContain("mipmaps: no");
    expect(section.textContent).toContain("Image 노드와 다르다");
  });

  it("does not show a texture-params section for a plain output node", () => {
    useGraphStore.getState().addNode(otherNode);
    useSelectionStore.getState().select("o1");
    render(<Inspector embedded />);

    expect(screen.queryByTestId("texture-params")).toBeNull();
  });
});

// [L1/E-4] Sampler inputs — same (target, targetHandle) lookup, surfaced as
// connection state instead of a driven/disabled control (samplers have no
// slider to disable).
describe("Inspector — Sampler inputs connection state (L1/E-4)", () => {
  const samplerShaderNode: ShaderGraphNode = {
    id: "s4",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "uniform sampler2D u_tex;",
    uniformValues: {},
  };

  const sourceShaderNode: ShaderGraphNode = {
    id: "src1",
    kind: "shader",
    vertexSource: "",
    fragmentSource: "",
    uniformValues: {},
  };

  it("shows 미연결 for an unconnected sampler input", () => {
    useGraphStore.getState().addNode(samplerShaderNode);
    useSelectionStore.getState().select("s4");
    render(<Inspector embedded />);

    const row = screen.getByTestId("sampler-input-row");
    expect(row.getAttribute("data-uniform-name")).toBe("u_tex");
    expect(row.getAttribute("data-connected")).toBe("false");
    expect(row.textContent).toContain("미연결");
  });

  it("shows the connected source node's display name", () => {
    useGraphStore.getState().addNode(samplerShaderNode);
    useGraphStore.getState().addNode(sourceShaderNode);
    useGraphStore.getState().renameNode("src1", "Tex Source");
    useGraphStore.getState().addEdge({
      id: "et1",
      source: "src1",
      sourceHandle: "texture",
      target: "s4",
      targetHandle: "u_tex",
    });
    useSelectionStore.getState().select("s4");
    render(<Inspector embedded />);

    const row = screen.getByTestId("sampler-input-row");
    expect(row.getAttribute("data-connected")).toBe("true");
    expect(row.textContent).toContain("← Tex Source");
    expect(row.textContent).not.toContain("미연결");
  });

  it("reverts to 미연결 when the edge is removed", () => {
    useGraphStore.getState().addNode(samplerShaderNode);
    useGraphStore.getState().addNode(sourceShaderNode);
    useGraphStore.getState().addEdge({
      id: "et1",
      source: "src1",
      sourceHandle: "texture",
      target: "s4",
      targetHandle: "u_tex",
    });
    useSelectionStore.getState().select("s4");
    render(<Inspector embedded />);

    expect(
      screen.getByTestId("sampler-input-row").getAttribute("data-connected"),
    ).toBe("true");

    act(() => {
      useGraphStore.getState().removeEdge("et1");
    });

    const row = screen.getByTestId("sampler-input-row");
    expect(row.getAttribute("data-connected")).toBe("false");
    expect(row.textContent).toContain("미연결");
  });
});
