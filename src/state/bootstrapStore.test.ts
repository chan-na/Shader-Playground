import { beforeEach, describe, expect, it } from "vitest";
import { useBootstrapStore } from "./bootstrapStore";

describe("bootstrapStore", () => {
  beforeEach(() => {
    useBootstrapStore.setState({ phase: "init" });
  });

  it("starts with phase 'init'", () => {
    expect(useBootstrapStore.getState().phase).toBe("init");
  });

  it("setPhase transitions init -> prompt -> done", () => {
    useBootstrapStore.getState().setPhase("prompt");
    expect(useBootstrapStore.getState().phase).toBe("prompt");

    useBootstrapStore.getState().setPhase("done");
    expect(useBootstrapStore.getState().phase).toBe("done");
  });

  it("setPhase can go straight from init to done (share/demo paths)", () => {
    useBootstrapStore.getState().setPhase("done");
    expect(useBootstrapStore.getState().phase).toBe("done");
  });
});
