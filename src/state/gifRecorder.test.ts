import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frameDelays, useGifRecorderStore } from "./gifRecorder";
import { useToastStore } from "./toastStore";
import { useViewportStore } from "./viewportStore";

describe("frameDelays", () => {
  it("uses inter-frame gaps and the fallback for the last frame", () => {
    expect(frameDelays([0, 100, 250], 80)).toEqual([100, 150, 80]);
  });
  it("returns the fallback for a single frame", () => {
    expect(frameDelays([42], 80)).toEqual([80]);
  });
  it("returns an empty array for no frames", () => {
    expect(frameDelays([], 80)).toEqual([]);
  });
  it("never returns negative delays", () => {
    expect(frameDelays([200, 100], 80)).toEqual([0, 80]);
  });

  // #31 — a backgrounded tab throttles RAF to ~1 Hz or stops it outright, so
  // the gap across a hidden stretch must not be baked into the GIF verbatim.
  it("clamps a backgrounded-tab gap to the 1s ceiling", () => {
    // 12 fps → 83.3ms nominal, so the ceiling is the 1000ms floor, not 4×.
    expect(frameDelays([0, 60_000], 1000 / 12)[0]).toBe(1000);
  });

  it("lets a deliberately slow recording keep 4× its nominal interval", () => {
    // 1 fps → 4000ms cap, so a 3s gap survives intact but 9s still clamps.
    expect(frameDelays([0, 3000, 12_000], 1000)).toEqual([3000, 4000, 1000]);
  });

  it("leaves ordinary sub-second gaps untouched", () => {
    expect(frameDelays([0, 100, 950], 80)).toEqual([100, 850, 80]);
  });
});

// --- Store with mocked 2D canvas ------------------------------------------

// fillRect/fillStyle are part of the required surface: captureFrame paints an
// opaque matte before drawImage (#16) and swallows any throw in its try/catch,
// so a FakeCtx missing them would silently degrade every test below to
// frameCount 0 rather than failing loudly.
interface FakeCtx {
  fillStyle: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  drawImage: () => void;
  getImageData: (x: number, y: number, w: number, h: number) => ImageData;
}

function resetStore() {
  useGifRecorderStore.setState({
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    frameCount: 0,
    encodeProgress: 0,
    lastBlobUrl: null,
    error: null,
  });
}

describe("useGifRecorderStore", () => {
  let clock = 0;
  let nowSpy: { mockRestore: () => void };
  let getContextSpy: { mockRestore: () => void } | undefined;

  beforeEach(() => {
    resetStore();
    useToastStore.setState({ toasts: [] });
    clock = 1000;
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    (
      globalThis as unknown as {
        URL: { createObjectURL: () => string; revokeObjectURL: () => void };
      }
    ).URL = {
      createObjectURL: vi.fn(() => "blob:gif-mock"),
      revokeObjectURL: vi.fn(),
    };
  });

  afterEach(async () => {
    // Drain the module-level _active singleton so tests don't leak state.
    if (useGifRecorderStore.getState().status !== "idle") {
      await useGifRecorderStore.getState().stop();
    }
    nowSpy.mockRestore();
    getContextSpy?.mockRestore();
    resetStore();
  });

  /** Ordered log of matte/draw calls so #16's ordering can be asserted. */
  let calls: string[] = [];
  /** `fillStyle` as it stood at each fillRect call. */
  let fillStyles: string[] = [];
  /** Every fillRect argument tuple, in order. */
  let fillRects: number[][] = [];

  function installFakeContext(): void {
    calls = [];
    fillStyles = [];
    fillRects = [];
    const fake: FakeCtx = {
      fillStyle: "",
      fillRect: (x, y, w, h) => {
        calls.push("fillRect");
        fillStyles.push(fake.fillStyle);
        fillRects.push([x, y, w, h]);
      },
      drawImage: () => {
        calls.push("drawImage");
      },
      getImageData: (_x, _y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
          data[i * 4] = i % 2 === 0 ? 0 : 248;
          data[i * 4 + 1] = 0;
          data[i * 4 + 2] = 0;
          data[i * 4 + 3] = 255;
        }
        return { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
      },
    };
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(fake as unknown as CanvasRenderingContext2D);
  }

  function makeCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  it("errors when a 2D context is unavailable", () => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    useGifRecorderStore.getState().start();
    expect(useGifRecorderStore.getState().status).toBe("idle");
    expect(useGifRecorderStore.getState().error).toMatch(/2D canvas/);
  });

  it("start() is idempotent while recording", () => {
    installFakeContext();
    useGifRecorderStore.getState().start();
    const startedAt = useGifRecorderStore.getState().startedAt;
    useGifRecorderStore.getState().start();
    expect(useGifRecorderStore.getState().startedAt).toBe(startedAt);
    expect(useGifRecorderStore.getState().status).toBe("recording");
  });

  it("throttles captures to the target fps", () => {
    installFakeContext();
    const canvas = makeCanvas(64, 48);
    useGifRecorderStore.getState().start({ fps: 10 }); // 100ms interval
    const r = useGifRecorderStore.getState();
    r.captureFrame(canvas); // t=1000, first frame
    clock = 1050;
    r.captureFrame(canvas); // within interval → ignored
    expect(useGifRecorderStore.getState().frameCount).toBe(1);
    clock = 1150;
    r.captureFrame(canvas); // interval elapsed → captured
    expect(useGifRecorderStore.getState().frameCount).toBe(2);
  });

  it("stops with no frames and reports an error", async () => {
    installFakeContext();
    useGifRecorderStore.getState().start();
    const blob = await useGifRecorderStore.getState().stop();
    expect(blob).toBeNull();
    expect(useGifRecorderStore.getState().status).toBe("idle");
    expect(
      useToastStore
        .getState()
        .toasts.some((t) => /프레임이 없/.test(t.message)),
    ).toBe(true);
  });

  it("captures frames and encodes a GIF blob on stop", async () => {
    installFakeContext();
    const canvas = makeCanvas(32, 24);
    useGifRecorderStore.getState().start({ fps: 20, maxLongEdge: 16 });
    const r = useGifRecorderStore.getState();
    for (let i = 0; i < 4; i++) {
      r.captureFrame(canvas);
      clock += 60;
    }
    expect(useGifRecorderStore.getState().frameCount).toBe(4);
    const blob = await useGifRecorderStore.getState().stop();
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe("image/gif");
    expect(useGifRecorderStore.getState().status).toBe("idle");
    expect(useGifRecorderStore.getState().lastBlobUrl).toBe("blob:gif-mock");
  });

  it("drives encodeProgress during encode and resets it on start", async () => {
    installFakeContext();
    const canvas = makeCanvas(32, 24);
    useGifRecorderStore.getState().start({ fps: 20, maxLongEdge: 16 });
    const r = useGifRecorderStore.getState();
    const seen: number[] = [];
    const unsub = useGifRecorderStore.subscribe((s) =>
      seen.push(s.encodeProgress),
    );
    for (let i = 0; i < 3; i++) {
      r.captureFrame(canvas);
      clock += 60;
    }
    // jsdom has no Worker, so stop() encodes inline and reports progress
    // synchronously for each of the 3 frames before resolving.
    await useGifRecorderStore.getState().stop();
    unsub();
    // Progress climbed to a full frame before the idle reset.
    expect(Math.max(...seen)).toBeCloseTo(1, 5);
    // Back to idle: progress reset.
    expect(useGifRecorderStore.getState().encodeProgress).toBe(0);

    // A fresh recording clears any lingering progress.
    useGifRecorderStore.setState({ encodeProgress: 0.5 });
    useGifRecorderStore.getState().start();
    expect(useGifRecorderStore.getState().encodeProgress).toBe(0);
  });

  it("honors the maxSeconds frame cap", () => {
    installFakeContext();
    const canvas = makeCanvas(16, 16);
    // fps 10 × 0.2s = 2 frame cap.
    useGifRecorderStore.getState().start({ fps: 10, maxSeconds: 0.2 });
    const r = useGifRecorderStore.getState();
    for (let i = 0; i < 6; i++) {
      r.captureFrame(canvas);
      clock += 200;
    }
    expect(useGifRecorderStore.getState().frameCount).toBe(2);
  });

  // --- #16: opaque matte behind every captured frame ----------------------

  it("paints one full-size opaque matte before drawImage on each capture", () => {
    installFakeContext();
    const canvas = makeCanvas(32, 24);
    useGifRecorderStore.getState().start({ fps: 20, maxLongEdge: 16 });
    const r = useGifRecorderStore.getState();
    r.captureFrame(canvas);
    clock += 60;
    r.captureFrame(canvas);

    expect(useGifRecorderStore.getState().frameCount).toBe(2);
    // Exactly one matte per capture, and always *before* the source is drawn.
    expect(calls).toEqual(["fillRect", "drawImage", "fillRect", "drawImage"]);
    // 32×24 fitted to a 16px long edge → 16×12; the matte covers all of it.
    for (const rect of fillRects) {
      expect(rect).toEqual([0, 0, 16, 12]);
    }
  });

  it("uses the viewport's own clear colour as the matte, not a hard-coded one", () => {
    const prev = useViewportStore.getState().background;
    useViewportStore.setState({ background: [1, 0.5, 0] });
    try {
      installFakeContext();
      useGifRecorderStore.getState().start({ fps: 20, maxLongEdge: 16 });
      useGifRecorderStore.getState().captureFrame(makeCanvas(16, 16));
      expect(fillStyles).toEqual(["rgb(255, 128, 0)"]);
    } finally {
      useViewportStore.setState({ background: prev });
    }
  });

  it("tracks a later background change on subsequent captures", () => {
    const prev = useViewportStore.getState().background;
    useViewportStore.setState({ background: [0, 0, 0] });
    try {
      installFakeContext();
      const canvas = makeCanvas(16, 16);
      useGifRecorderStore.getState().start({ fps: 20, maxLongEdge: 16 });
      useGifRecorderStore.getState().captureFrame(canvas);
      useViewportStore.getState().setBackground([1, 1, 1]);
      clock += 60;
      useGifRecorderStore.getState().captureFrame(canvas);
      expect(fillStyles).toEqual(["rgb(0, 0, 0)", "rgb(255, 255, 255)"]);
    } finally {
      useViewportStore.setState({ background: prev });
    }
  });

  it("tick() updates elapsedMs while recording", () => {
    installFakeContext();
    useGifRecorderStore.getState().start();
    clock = 1500;
    useGifRecorderStore.getState().tick();
    expect(useGifRecorderStore.getState().elapsedMs).toBe(500);
  });
});
