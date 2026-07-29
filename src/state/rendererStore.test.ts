import { beforeEach, describe, expect, it } from "vitest";
import { useRendererStore } from "./rendererStore";

describe("rendererStore", () => {
  beforeEach(() => {
    useRendererStore.setState({
      ready: false,
      stats: { fps: 0, frame: 0, drawCalls: 0, renderTick: 0, errors: [] },
      panes: [],
      canvasSize: { width: 1, height: 1 },
      contextUnavailable: false,
      glRetryTick: 0,
      snapshotRequested: false,
    });
  });

  it("setReady toggles ready flag", () => {
    useRendererStore.getState().setReady(true);
    expect(useRendererStore.getState().ready).toBe(true);
    useRendererStore.getState().setReady(false);
    expect(useRendererStore.getState().ready).toBe(false);
  });

  it("setStats merges partial stats", () => {
    useRendererStore.getState().setStats({ fps: 60 });
    useRendererStore.getState().setStats({ frame: 1024 });
    const { fps, frame, drawCalls } = useRendererStore.getState().stats;
    expect(fps).toBe(60);
    expect(frame).toBe(1024);
    expect(drawCalls).toBe(0);
  });

  it("bumpRenderTick increments the cumulative renderTick counter", () => {
    const before = useRendererStore.getState().stats.renderTick;
    useRendererStore.getState().bumpRenderTick();
    useRendererStore.getState().bumpRenderTick();
    expect(useRendererStore.getState().stats.renderTick).toBe(before + 2);
  });

  it("pushError appends and clearErrors resets", () => {
    useRendererStore.getState().pushError("boom");
    useRendererStore.getState().pushError("bang");
    expect(useRendererStore.getState().stats.errors).toEqual(["boom", "bang"]);
    useRendererStore.getState().clearErrors();
    expect(useRendererStore.getState().stats.errors).toEqual([]);
  });

  it("pushError caps retained errors at 50 (most recent kept)", () => {
    const push = useRendererStore.getState().pushError;
    for (let i = 0; i < 60; i++) push(`e${i}`);
    const { errors } = useRendererStore.getState().stats;
    expect(errors.length).toBe(50);
    expect(errors[0]).toBe("e10");
    expect(errors[errors.length - 1]).toBe("e59");
  });

  it("initial state has empty panes and a 1x1 canvasSize", () => {
    const { panes, canvasSize } = useRendererStore.getState();
    expect(panes).toEqual([]);
    expect(canvasSize).toEqual({ width: 1, height: 1 });
  });

  it("setPanes replaces the pane list", () => {
    useRendererStore
      .getState()
      .setPanes([{ outputNodeId: "out1", sourceNodeId: "src1" }]);
    expect(useRendererStore.getState().panes).toEqual([
      { outputNodeId: "out1", sourceNodeId: "src1" },
    ]);
  });

  it("setPanes with an equal-content array is a no-op (state reference kept)", () => {
    useRendererStore
      .getState()
      .setPanes([{ outputNodeId: "out1", sourceNodeId: "src1" }]);
    const before = useRendererStore.getState().panes;
    useRendererStore
      .getState()
      .setPanes([{ outputNodeId: "out1", sourceNodeId: "src1" }]);
    expect(useRendererStore.getState().panes).toBe(before);
  });

  it("setPanes with different content replaces the reference", () => {
    useRendererStore
      .getState()
      .setPanes([{ outputNodeId: "out1", sourceNodeId: "src1" }]);
    const before = useRendererStore.getState().panes;
    useRendererStore
      .getState()
      .setPanes([{ outputNodeId: "out2", sourceNodeId: "src2" }]);
    const after = useRendererStore.getState().panes;
    expect(after).not.toBe(before);
    expect(after).toEqual([{ outputNodeId: "out2", sourceNodeId: "src2" }]);
  });

  it("setCanvasSize with the same width/height is a no-op (state reference kept)", () => {
    useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
    const before = useRendererStore.getState().canvasSize;
    useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
    expect(useRendererStore.getState().canvasSize).toBe(before);
  });

  it("setCanvasSize with a changed dimension updates the state", () => {
    useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
    useRendererStore.getState().setCanvasSize({ width: 1024, height: 600 });
    expect(useRendererStore.getState().canvasSize).toEqual({
      width: 1024,
      height: 600,
    });
  });

  it("setContextUnavailable sets and clears the GPU block flag", () => {
    expect(useRendererStore.getState().contextUnavailable).toBe(false);
    useRendererStore.getState().setContextUnavailable(true);
    expect(useRendererStore.getState().contextUnavailable).toBe(true);
    useRendererStore.getState().setContextUnavailable(false);
    expect(useRendererStore.getState().contextUnavailable).toBe(false);
  });

  it("retryGlContext bumps glRetryTick and clears contextUnavailable", () => {
    useRendererStore.getState().setContextUnavailable(true);
    const before = useRendererStore.getState().glRetryTick;
    useRendererStore.getState().retryGlContext();
    expect(useRendererStore.getState().glRetryTick).toBe(before + 1);
    expect(useRendererStore.getState().contextUnavailable).toBe(false);
  });

  // Snapshot request (#3). The Viewport RAF loop reads `snapshotRequested` to
  // force one draw past the idle gate, then consumes the flag right after
  // executePlan. Both halves depend on the one-shot semantics below.
  describe("snapshot request", () => {
    it("starts with no pending request and consume returns false", () => {
      expect(useRendererStore.getState().snapshotRequested).toBe(false);
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(false);
    });

    it("requestSnapshot arms the flag for the idle gate to observe", () => {
      useRendererStore.getState().requestSnapshot();
      expect(useRendererStore.getState().snapshotRequested).toBe(true);
    });

    it("consume is one-shot: true once, false on the next call", () => {
      useRendererStore.getState().requestSnapshot();
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(true);
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(false);
      expect(useRendererStore.getState().snapshotRequested).toBe(false);
    });

    it("repeated requests before a consume still yield a single capture", () => {
      const store = useRendererStore.getState();
      store.requestSnapshot();
      store.requestSnapshot();
      store.requestSnapshot();
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(true);
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(false);
    });

    it("a request placed after a consume is served independently", () => {
      useRendererStore.getState().requestSnapshot();
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(true);
      useRendererStore.getState().requestSnapshot();
      expect(useRendererStore.getState().snapshotRequested).toBe(true);
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(true);
    });

    it("an already-armed request keeps the same state reference (no re-render churn)", () => {
      useRendererStore.getState().requestSnapshot();
      const before = useRendererStore.getState();
      useRendererStore.getState().requestSnapshot();
      expect(useRendererStore.getState()).toBe(before);
    });
  });
});
