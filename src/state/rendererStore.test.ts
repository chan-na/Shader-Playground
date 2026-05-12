import { beforeEach, describe, expect, it } from "vitest";
import { useRendererStore } from "./rendererStore";

describe("rendererStore", () => {
  beforeEach(() => {
    useRendererStore.setState({
      ready: false,
      stats: { fps: 0, frame: 0, drawCalls: 0, renderTick: 0, errors: [] },
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
});
