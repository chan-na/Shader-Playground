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
  //
  // `ready` is the "is that loop alive?" signal — written only by the Viewport
  // effect (true after createGLContext succeeds, false in its cleanup), so these
  // tests arm it explicitly to stand in for a mounted Viewport. The
  // module-level beforeEach leaves it false on purpose: that is the
  // panel-closed state, which F1's guard has to refuse.
  describe("snapshot request", () => {
    beforeEach(() => {
      useRendererStore.getState().setReady(true);
      // A *visible* Viewport: the outer beforeEach leaves `canvasSize` at the
      // store's 1×1 default, which is also the shape `resize()` produces for a
      // `display:none` canvas — and which the F21 guard below refuses. Every
      // case in here is about the request's lifetime, not its visibility, so
      // give them a real drawing buffer to work against.
      useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
    });

    it("starts with no pending request and consume returns false", () => {
      expect(useRendererStore.getState().snapshotRequested).toBe(false);
      expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(false);
    });

    it("requestSnapshot arms the flag for the idle gate to observe", () => {
      expect(useRendererStore.getState().requestSnapshot()).toBe(true);
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
      expect(store.requestSnapshot()).toBe(true);
      expect(store.requestSnapshot()).toBe(true);
      expect(store.requestSnapshot()).toBe(true);
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

    // F1. `snapshotRequested` must never survive a Viewport lifetime boundary:
    // the flag has exactly one server, so a request that outlives the loop that
    // was meant to serve it fires on the *next* mount — an unrequested PNG
    // download. Two windows let that happen, and both are closed here.
    describe("must not outlive the Viewport that would serve it (F1)", () => {
      it("refuses to arm while no render loop is running", () => {
        useRendererStore.getState().setReady(false);
        expect(useRendererStore.getState().requestSnapshot()).toBe(false);
        expect(useRendererStore.getState().snapshotRequested).toBe(false);
      });

      it("a refused request keeps the same state reference", () => {
        useRendererStore.getState().setReady(false);
        const before = useRendererStore.getState();
        useRendererStore.getState().requestSnapshot();
        expect(useRendererStore.getState()).toBe(before);
      });

      // W2 — the reported bug: File ▸ Snap PNG pressed with the Viewport panel
      // closed. Remounting the panel must not download anything.
      it("armed while unmounted → nothing pending for the next mount", () => {
        useRendererStore.getState().setReady(false); // panel closed
        useRendererStore.getState().requestSnapshot(); // user clicks Snap PNG
        useRendererStore.getState().setReady(true); // panel reopened
        expect(useRendererStore.getState().snapshotRequested).toBe(false);
        expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(
          false,
        );
      });

      // W1 — armed while mounted, then torn down before the next RAF tick could
      // serve it. The effect cleanup consumes the request (see Viewport's
      // cleanup); this pins the store half of that contract.
      it("armed then torn down → the cleanup's consume leaves nothing pending", () => {
        expect(useRendererStore.getState().requestSnapshot()).toBe(true);
        // Viewport cleanup: consume the orphaned request, then drop `ready`.
        expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(true);
        useRendererStore.getState().setReady(false);
        useRendererStore.getState().setReady(true); // next mount
        expect(useRendererStore.getState().snapshotRequested).toBe(false);
        expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(
          false,
        );
      });
    });

    // F21. `ready` says the loop is alive, not that anything is on screen. A
    // collapsed rail / maximised sibling hides the Viewport with `display:none`
    // while it stays mounted, so `resize()` floors the drawing buffer at 1×1
    // and the capture yielded a 1×1 PNG — no error, no warning, just a useless
    // file. The guard belongs here rather than in the Viewport because that
    // file has no unit coverage at all.
    describe("must not capture an invisible canvas (F21)", () => {
      it("refuses while the drawing buffer is at its 1×1 floor", () => {
        useRendererStore.getState().setCanvasSize({ width: 1, height: 1 });
        expect(useRendererStore.getState().ready).toBe(true);
        expect(useRendererStore.getState().requestSnapshot()).toBe(false);
        expect(useRendererStore.getState().snapshotRequested).toBe(false);
      });

      it("a refused request keeps the same state reference", () => {
        useRendererStore.getState().setCanvasSize({ width: 1, height: 1 });
        const before = useRendererStore.getState();
        useRendererStore.getState().requestSnapshot();
        expect(useRendererStore.getState()).toBe(before);
      });

      it("nothing stays armed for the frame after the panel is expanded", () => {
        useRendererStore.getState().setCanvasSize({ width: 1, height: 1 });
        useRendererStore.getState().requestSnapshot(); // user clicks Snap PNG
        useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
        expect(useRendererStore.getState().snapshotRequested).toBe(false);
        expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(
          false,
        );
      });

      it("serves the request again once the panel is expanded", () => {
        useRendererStore.getState().setCanvasSize({ width: 1, height: 1 });
        expect(useRendererStore.getState().requestSnapshot()).toBe(false);
        useRendererStore.getState().setCanvasSize({ width: 800, height: 600 });
        // The guard gates on the current size; it must not latch the panel out
        // of service once it has refused.
        expect(useRendererStore.getState().requestSnapshot()).toBe(true);
        expect(useRendererStore.getState().consumeSnapshotRequest()).toBe(true);
      });

      it("still captures a thin but genuinely visible panel", () => {
        // Only the both-axes-floored case is `display:none`. A 1px-wide strip
        // that is actually rendered still has a real height, and refusing it
        // would be a false positive.
        useRendererStore.getState().setCanvasSize({ width: 1, height: 600 });
        expect(useRendererStore.getState().requestSnapshot()).toBe(true);
      });
    });
  });
});
