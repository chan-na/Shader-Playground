import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frameDelays, useGifRecorderStore } from "./gifRecorder";
import { useToastStore } from "./toastStore";

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
});

// --- Store with mocked 2D canvas ------------------------------------------

interface FakeCtx {
  drawImage: () => void;
  getImageData: (x: number, y: number, w: number, h: number) => ImageData;
}

function resetStore() {
  useGifRecorderStore.setState({
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    frameCount: 0,
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

  function installFakeContext(): void {
    const fake: FakeCtx = {
      drawImage: () => {},
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

  it("tick() updates elapsedMs while recording", () => {
    installFakeContext();
    useGifRecorderStore.getState().start();
    clock = 1500;
    useGifRecorderStore.getState().tick();
    expect(useGifRecorderStore.getState().elapsedMs).toBe(500);
  });
});
