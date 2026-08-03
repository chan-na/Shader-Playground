import { beforeEach, describe, expect, it } from "vitest";
import type {
  ComputePassRow,
  NodeVaryingRow,
  NodeVaryings,
  PassRow,
  ShaderPassRow,
} from "./passPlanStore";
import { usePassPlanStore } from "./passPlanStore";

function shaderRow(nodeId: string): ShaderPassRow {
  return {
    kind: "shader",
    nodeId,
    width: 800,
    height: 600,
    resolutionScale: 1,
    meshIsFullscreen: true,
    meshLabel: "fullscreen quad",
    meshComputeNodeId: null,
    samplers: [],
    meshAttributeUse: [],
    silentWarnings: [],
  };
}

function computeRow(nodeId: string, read: "A" | "B" = "A"): ComputePassRow {
  return {
    kind: "compute",
    nodeId,
    count: 1024,
    primitiveLabel: "POINTS",
    getRead: () => read,
  };
}

function varyings(name: string): NodeVaryings {
  const row: NodeVaryingRow = {
    name,
    vertexType: "vec2",
    fragmentType: "vec2",
    fragmentUsed: true,
    status: "linked",
  };
  return { rows: [row], confident: true };
}

beforeEach(() => {
  usePassPlanStore.getState().reset();
});

describe("passPlanStore.publish", () => {
  it("replaces rows, fullscreenByNode and varyingsByNode wholesale", () => {
    usePassPlanStore
      .getState()
      .publish([shaderRow("a")], { a: true }, { a: varyings("v_uv") });
    expect(usePassPlanStore.getState().rows).toEqual([shaderRow("a")]);
    expect(usePassPlanStore.getState().fullscreenByNode).toEqual({ a: true });
    expect(usePassPlanStore.getState().varyingsByNode).toEqual({
      a: varyings("v_uv"),
    });

    const rowsB: PassRow[] = [shaderRow("b"), computeRow("c")];
    const varyingsB = { b: varyings("v_normal") };
    usePassPlanStore.getState().publish(rowsB, { b: false }, varyingsB);
    expect(usePassPlanStore.getState().rows).toBe(rowsB);
    expect(usePassPlanStore.getState().fullscreenByNode).toEqual({ b: false });
    expect(usePassPlanStore.getState().varyingsByNode).toBe(varyingsB);
  });
});

describe("passPlanStore.retainOnly", () => {
  it("drops rows, fullscreenByNode and varyingsByNode entries for nodes no longer present", () => {
    usePassPlanStore
      .getState()
      .publish(
        [shaderRow("a"), shaderRow("b"), computeRow("c")],
        { a: true, b: false },
        { a: varyings("v_uv"), b: varyings("v_normal") },
      );

    usePassPlanStore.getState().retainOnly(["a", "c"]);

    const s = usePassPlanStore.getState();
    expect(s.rows.map((r) => r.nodeId)).toEqual(["a", "c"]);
    expect(s.fullscreenByNode).toEqual({ a: true });
    expect(s.varyingsByNode).toEqual({ a: varyings("v_uv") });
  });

  it("preserves identity of rows, fullscreenByNode and varyingsByNode when nothing is pruned", () => {
    const rows: PassRow[] = [shaderRow("a"), computeRow("c")];
    const fullscreenByNode = { a: true };
    const varyingsByNode = { a: varyings("v_uv") };
    usePassPlanStore.getState().publish(rows, fullscreenByNode, varyingsByNode);

    usePassPlanStore.getState().retainOnly(["a", "c"]);

    const s = usePassPlanStore.getState();
    expect(s.rows).toBe(rows);
    expect(s.fullscreenByNode).toBe(fullscreenByNode);
    expect(s.varyingsByNode).toBe(varyingsByNode);
  });

  it("prunes fullscreenByNode and varyingsByNode even when no row references the removed node", () => {
    // fullscreenByNode/varyingsByNode are supersets of shaderPassByNode
    // (T1/A-1, T4/A-2): a node can have a record with no corresponding row
    // (compile-failed fullscreen node). retainOnly must still prune both
    // once the node itself is gone.
    usePassPlanStore
      .getState()
      .publish([], { orphan: true }, { orphan: varyings("v_uv") });
    usePassPlanStore.getState().retainOnly([]);
    expect(usePassPlanStore.getState().fullscreenByNode).toEqual({});
    expect(usePassPlanStore.getState().varyingsByNode).toEqual({});
  });
});

describe("passPlanStore.reset", () => {
  it("clears rows, fullscreenByNode and varyingsByNode", () => {
    usePassPlanStore
      .getState()
      .publish([shaderRow("a")], { a: true }, { a: varyings("v_uv") });
    usePassPlanStore.getState().reset();
    const s = usePassPlanStore.getState();
    expect(s.rows).toEqual([]);
    expect(s.fullscreenByNode).toEqual({});
    expect(s.varyingsByNode).toEqual({});
  });
});
