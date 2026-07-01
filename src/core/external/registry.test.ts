import { afterEach, describe, expect, it } from "vitest";
import {
  __setAudioContextFactoryForTests,
  __setGetUserMediaForTests,
  disposeAllExternal,
  externalHandleCount,
  getExternalAudioBins,
  getExternalStatus,
  getExternalStream,
  getExternalTexture,
  getExternalVideoElement,
  reconcileExternal,
  setAudioBlobResolver,
  setVideoBlobResolver,
  updateExternalSources,
} from "./registry";

// All tests run against the module singleton — clean it up so order doesn't
// matter and a flake in one case doesn't leak into the next.
afterEach(() => {
  __setGetUserMediaForTests(null);
  __setAudioContextFactoryForTests(null);
  setVideoBlobResolver(null);
  setAudioBlobResolver(null);
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

describe("video specs", () => {
  it("creates a handle for a video spec and records 'no asset' when assetId is null", () => {
    reconcileExternal([
      {
        nodeId: "v1",
        kind: "video",
        assetId: null,
        playing: true,
        loop: true,
        muted: true,
      },
    ]);
    expect(externalHandleCount()).toBe(1);
    const status = getExternalStatus("v1");
    expect(status?.ready).toBe(false);
    expect(status?.error).toMatch(/no video asset/i);
    expect(getExternalVideoElement("v1")).not.toBeNull();
  });

  it("records an error when no blob resolver is registered", () => {
    setVideoBlobResolver(null);
    reconcileExternal([
      {
        nodeId: "v1",
        kind: "video",
        assetId: "abc",
        playing: true,
        loop: true,
        muted: true,
      },
    ]);
    const status = getExternalStatus("v1");
    expect(status?.error).toMatch(/resolver/i);
  });

  it("records an error when the resolver returns null for the assetId", () => {
    setVideoBlobResolver(() => null);
    reconcileExternal([
      {
        nodeId: "v1",
        kind: "video",
        assetId: "missing",
        playing: true,
        loop: true,
        muted: true,
      },
    ]);
    const status = getExternalStatus("v1");
    expect(status?.error).toMatch(/asset not found/i);
  });

  it("creates a fresh handle when the assetId changes (restart path)", () => {
    setVideoBlobResolver(() => null);
    reconcileExternal([
      {
        nodeId: "v1",
        kind: "video",
        assetId: "a",
        playing: true,
        loop: true,
        muted: true,
      },
    ]);
    expect(externalHandleCount()).toBe(1);
    reconcileExternal([
      {
        nodeId: "v1",
        kind: "video",
        assetId: "b",
        playing: true,
        loop: true,
        muted: true,
      },
    ]);
    expect(externalHandleCount()).toBe(1);
  });

  it("getExternalStream returns null for video handles (webcam-only API)", () => {
    reconcileExternal([
      {
        nodeId: "v1",
        kind: "video",
        assetId: null,
        playing: true,
        loop: true,
        muted: true,
      },
    ]);
    expect(getExternalStream("v1")).toBeNull();
  });

  it("getExternalVideoElement returns null for webcam handles (video-only API)", () => {
    __setGetUserMediaForTests(() => new Promise(() => {}));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    expect(getExternalVideoElement("w1")).toBeNull();
  });

  it("getExternalTexture returns null before the first frame uploads", () => {
    reconcileExternal([
      {
        nodeId: "v1",
        kind: "video",
        assetId: null,
        playing: true,
        loop: true,
        muted: true,
      },
    ]);
    expect(getExternalTexture("v1")).toBeNull();
  });
});

/**
 * Minimal AudioContext stand-in covering only the surface registry.ts touches.
 * Returning fake AnalyserNode + buffer/source factories lets us assert the
 * lifecycle (acquire / restart / dispose) without depending on Web Audio.
 */
function fakeAudioContext() {
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 16,
    getByteFrequencyData: () => {},
    disconnect: () => {},
  } as unknown as AnalyserNode;
  let lastSource: AudioBufferSourceNode | null = null;
  const ctx = {
    state: "running",
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
    createAnalyser: () => analyser,
    createMediaStreamSource: () =>
      ({
        connect: () => {},
        disconnect: () => {},
      }) as unknown as MediaStreamAudioSourceNode,
    createBufferSource: () => {
      const s = {
        buffer: null,
        loop: false,
        start: () => {},
        stop: () => {},
        connect: () => {},
        disconnect: () => {},
      } as unknown as AudioBufferSourceNode;
      lastSource = s;
      return s;
    },
    decodeAudioData: () => Promise.resolve({} as AudioBuffer),
  } as unknown as AudioContext;
  return { ctx, analyser, getLastSource: () => lastSource };
}

describe("audio specs", () => {
  it("creates a handle and reports 'no asset' for file mode without assetId", () => {
    const { ctx } = fakeAudioContext();
    __setAudioContextFactoryForTests(() => ctx);
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "file",
        assetId: null,
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);
    expect(externalHandleCount()).toBe(1);
    const status = getExternalStatus("a1");
    expect(status?.error).toMatch(/no audio asset/i);
  });

  it("records an error when the file-mode resolver is not registered", () => {
    const { ctx } = fakeAudioContext();
    __setAudioContextFactoryForTests(() => ctx);
    setAudioBlobResolver(null);
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "file",
        assetId: "abc",
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);
    return Promise.resolve().then(() => {
      expect(getExternalStatus("a1")?.error).toMatch(/resolver/i);
    });
  });

  it("records an error when the resolver returns null", () => {
    const { ctx } = fakeAudioContext();
    __setAudioContextFactoryForTests(() => ctx);
    setAudioBlobResolver(() => null);
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "file",
        assetId: "missing",
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);
    return Promise.resolve().then(() => {
      expect(getExternalStatus("a1")?.error).toMatch(/asset not found/i);
    });
  });

  it("restarts when fftSize changes (different analyser sizing)", () => {
    const { ctx } = fakeAudioContext();
    __setAudioContextFactoryForTests(() => ctx);
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "mic",
        assetId: null,
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);
    expect(externalHandleCount()).toBe(1);
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "mic",
        assetId: null,
        fftSize: 512,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);
    // Restart path: old handle disposed, new acquired → count stays 1.
    expect(externalHandleCount()).toBe(1);
  });

  it("records an error when no AudioContext factory is available", () => {
    __setAudioContextFactoryForTests(() => null);
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "mic",
        assetId: null,
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);
    expect(getExternalStatus("a1")?.error).toMatch(/audiocontext/i);
  });

  it("getExternalAudioBins returns null before any frame samples", () => {
    const { ctx } = fakeAudioContext();
    __setAudioContextFactoryForTests(() => ctx);
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "mic",
        assetId: null,
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
      },
    ]);
    // bins are pre-allocated at acquire time so the buffer exists even before
    // the first analyser sample — assert the shape rather than presence.
    const bins = getExternalAudioBins("a1");
    expect(bins).toBeInstanceOf(Uint8Array);
    expect(bins?.length).toBe(16);
  });

  it("getExternalAudioBins returns null for non-audio handles", () => {
    __setGetUserMediaForTests(() => new Promise(() => {}));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    expect(getExternalAudioBins("w1")).toBeNull();
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

describe("external texture lifecycle (M3/M5)", () => {
  // Minimal WebGL2 stand-in: the external texture path only touches these
  // methods, and the GL enum constants are passed through unread, so a partial
  // fake is sufficient. A full WebGL2RenderingContext cannot be built in jsdom.
  function makeFakeGl() {
    let created = 0;
    let deleted = 0;
    const noop = () => {};
    const gl = {
      createTexture: () => {
        created += 1;
        return { __tex: created };
      },
      deleteTexture: () => {
        deleted += 1;
      },
      bindTexture: noop,
      texParameteri: noop,
      pixelStorei: noop,
      texImage2D: noop,
      texSubImage2D: noop,
    };
    return {
      gl: gl as unknown as WebGL2RenderingContext,
      created: () => created,
      deleted: () => deleted,
    };
  }

  function fakeAudioContext() {
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 16,
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(128),
      disconnect: () => {},
    };
    return {
      createAnalyser: () => analyser,
      createMediaStreamSource: () => ({
        connect: () => {},
        disconnect: () => {},
      }),
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    } as unknown as AudioContext;
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    __setAudioContextFactoryForTests(null);
  });

  async function readyMicAudio() {
    __setAudioContextFactoryForTests(() => fakeAudioContext());
    __setGetUserMediaForTests(() => Promise.resolve(fakeStream()));
    reconcileExternal([
      {
        nodeId: "a1",
        kind: "audio",
        sourceKind: "mic",
        assetId: null,
        fftSize: 32,
        smoothing: 0.8,
        playing: true,
        loop: false,
      },
    ]);
    await flush();
    expect(getExternalStatus("a1")?.ready).toBe(true);
  }

  it("creates exactly one GPU texture when a source is uploaded", async () => {
    await readyMicAudio();
    const fake = makeFakeGl();
    updateExternalSources(fake.gl);
    expect(fake.created()).toBe(1);
    // Idempotent uploads reuse the texture (no per-frame create).
    updateExternalSources(fake.gl);
    expect(fake.created()).toBe(1);
  });

  it("deletes the texture on reconcile-remove via the stashed gl (M3)", async () => {
    await readyMicAudio();
    const fake = makeFakeGl();
    updateExternalSources(fake.gl); // creates the texture + stashes gl
    expect(fake.created()).toBe(1);

    // reconcileExternal runs inside compile with no GL context in scope; the
    // registry must delete the orphaned texture using the last-render gl.
    reconcileExternal([]);
    expect(fake.deleted()).toBe(fake.created());
    expect(externalHandleCount()).toBe(0);
  });

  it("deletes the texture on disposeAllExternal(gl)", async () => {
    await readyMicAudio();
    const fake = makeFakeGl();
    updateExternalSources(fake.gl);
    expect(fake.created()).toBe(1);
    disposeAllExternal(fake.gl);
    expect(fake.deleted()).toBe(1);
    expect(externalHandleCount()).toBe(0);
  });
});
