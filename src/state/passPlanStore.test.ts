import { beforeEach, describe, expect, it } from "vitest";
import type { ComputePassRow, PassRow, ShaderPassRow } from "./passPlanStore";
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

beforeEach(() => {
  usePassPlanStore.getState().reset();
});

describe("passPlanStore.publish", () => {
  it("replaces rows and fullscreenByNode wholesale", () => {
    usePassPlanStore.getState().publish([shaderRow("a")], { a: true });
    expect(usePassPlanStore.getState().rows).toEqual([shaderRow("a")]);
    expect(usePassPlanStore.getState().fullscreenByNode).toEqual({ a: true });

    const rowsB: PassRow[] = [shaderRow("b"), computeRow("c")];
    usePassPlanStore.getState().publish(rowsB, { b: false });
    expect(usePassPlanStore.getState().rows).toBe(rowsB);
    expect(usePassPlanStore.getState().fullscreenByNode).toEqual({ b: false });
  });
});

describe("passPlanStore.retainOnly", () => {
  it("drops rows and fullscreenByNode entries for nodes no longer present", () => {
    usePassPlanStore
      .getState()
      .publish([shaderRow("a"), shaderRow("b"), computeRow("c")], {
        a: true,
        b: false,
      });

    usePassPlanStore.getState().retainOnly(["a", "c"]);

    const s = usePassPlanStore.getState();
    expect(s.rows.map((r) => r.nodeId)).toEqual(["a", "c"]);
    expect(s.fullscreenByNode).toEqual({ a: true });
  });

  it("preserves identity of both rows and fullscreenByNode when nothing is pruned", () => {
    const rows: PassRow[] = [shaderRow("a"), computeRow("c")];
    const fullscreenByNode = { a: true };
    usePassPlanStore.getState().publish(rows, fullscreenByNode);

    usePassPlanStore.getState().retainOnly(["a", "c"]);

    const s = usePassPlanStore.getState();
    expect(s.rows).toBe(rows);
    expect(s.fullscreenByNode).toBe(fullscreenByNode);
  });

  it("prunes fullscreenByNode even when no row references the removed node", () => {
    // fullscreenByNode is a superset of shaderPassByNode (T1/A-1): a node can
    // have a record with no corresponding row (compile-failed fullscreen
    // node). retainOnly must still prune it once the node itself is gone.
    usePassPlanStore.getState().publish([], { orphan: true });
    usePassPlanStore.getState().retainOnly([]);
    expect(usePassPlanStore.getState().fullscreenByNode).toEqual({});
  });
});

describe("passPlanStore.reset", () => {
  it("clears rows and fullscreenByNode", () => {
    usePassPlanStore.getState().publish([shaderRow("a")], { a: true });
    usePassPlanStore.getState().reset();
    const s = usePassPlanStore.getState();
    expect(s.rows).toEqual([]);
    expect(s.fullscreenByNode).toEqual({});
  });
});
