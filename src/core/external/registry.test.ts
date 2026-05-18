import { afterEach, describe, expect, it } from "vitest";
import {
  __setGetUserMediaForTests,
  disposeAllExternal,
  externalHandleCount,
  getExternalStatus,
  getExternalStream,
  getExternalTexture,
  reconcileExternal,
} from "./registry";

// All tests run against the module singleton — clean it up so order doesn't
// matter and a flake in one case doesn't leak into the next.
afterEach(() => {
  __setGetUserMediaForTests(null);
  disposeAllExternal();
});

/**
 * Tiny fake MediaStream that satisfies the surface registry.ts touches:
 *   - getTracks() returns a stoppable array
 *   - is otherwise opaque
 */
function fakeStream() {
  const tracks = [{ stop: () => {} }];
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe("reconcileExternal", () => {
  it("returns 0 handles for an empty spec list", () => {
    reconcileExternal([]);
    expect(externalHandleCount()).toBe(0);
  });

  it("creates a handle for each new webcam spec", () => {
    __setGetUserMediaForTests(() => new Promise(() => {}));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    expect(externalHandleCount()).toBe(1);
    expect(getExternalStatus("w1")?.ready).toBe(false);
  });

  it("is idempotent — reconciling the same spec keeps the same handle", () => {
    __setGetUserMediaForTests(() => new Promise(() => {}));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    const firstCount = externalHandleCount();
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    expect(externalHandleCount()).toBe(firstCount);
  });

  it("releases handles whose node was removed from the graph", () => {
    __setGetUserMediaForTests(() => new Promise(() => {}));
    reconcileExternal([
      { nodeId: "w1", kind: "webcam" },
      { nodeId: "w2", kind: "webcam" },
    ]);
    expect(externalHandleCount()).toBe(2);
    reconcileExternal([{ nodeId: "w2", kind: "webcam" }]);
    expect(externalHandleCount()).toBe(1);
    expect(getExternalStatus("w1")).toBeNull();
    expect(getExternalStatus("w2")).not.toBeNull();
  });

  it("restarts the handle when deviceId changes", () => {
    __setGetUserMediaForTests(() => new Promise(() => {}));
    reconcileExternal([{ nodeId: "w1", kind: "webcam", deviceId: "cam-a" }]);
    expect(externalHandleCount()).toBe(1);
    // Changing deviceId tears down the old handle (dispose) and acquires fresh.
    // Externally observable signal: count stays at 1 (old released + new
    // created) and getExternalStream returns null because we never resolved.
    reconcileExternal([{ nodeId: "w1", kind: "webcam", deviceId: "cam-b" }]);
    expect(externalHandleCount()).toBe(1);
    expect(getExternalStream("w1")).toBeNull();
  });
});

describe("webcam acquisition outcomes", () => {
  it("marks the handle ready and exposes the stream when getUserMedia resolves", async () => {
    const stream = fakeStream();
    __setGetUserMediaForTests(() => Promise.resolve(stream));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    // Drain the microtask queue so startWebcam's awaits resolve.
    await Promise.resolve();
    await Promise.resolve();
    const status = getExternalStatus("w1");
    expect(status?.ready).toBe(true);
    expect(status?.error).toBeNull();
    expect(getExternalStream("w1")).toBe(stream);
  });

  it("records an error and leaves ready=false when getUserMedia rejects", async () => {
    __setGetUserMediaForTests(() =>
      Promise.reject(new Error("permission denied")),
    );
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    await Promise.resolve();
    await Promise.resolve();
    const status = getExternalStatus("w1");
    expect(status?.ready).toBe(false);
    expect(status?.error).toContain("permission denied");
    expect(getExternalStream("w1")).toBeNull();
  });

  it("reports a clear error when MediaDevices is unavailable", async () => {
    // Explicitly pass null so registry.ts falls back to navigator, then drop
    // navigator.mediaDevices for this case.
    __setGetUserMediaForTests(null);
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    try {
      reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
      await Promise.resolve();
      const status = getExternalStatus("w1");
      expect(status?.ready).toBe(false);
      expect(status?.error).toMatch(/unavailable/i);
    } finally {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: original,
      });
    }
  });
});

describe("getExternalTexture", () => {
  it("returns null when no GL texture has been uploaded yet", () => {
    __setGetUserMediaForTests(() => new Promise(() => {}));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    expect(getExternalTexture("w1")).toBeNull();
  });

  it("returns null for unknown node IDs", () => {
    expect(getExternalTexture("does-not-exist")).toBeNull();
  });
});

describe("disposeAllExternal", () => {
  it("empties the registry and stops the stream tracks", async () => {
    const stopCalls: Array<string> = [];
    const stream = {
      getTracks: () => [{ stop: () => stopCalls.push("stopped") }],
    } as unknown as MediaStream;
    __setGetUserMediaForTests(() => Promise.resolve(stream));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(externalHandleCount()).toBe(1);
    disposeAllExternal();
    expect(externalHandleCount()).toBe(0);
    expect(stopCalls).toEqual(["stopped"]);
  });
});
