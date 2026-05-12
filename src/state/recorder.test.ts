import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecorderStore } from "./recorder";
import { useToastStore } from "./toastStore";

// MediaRecorder is not implemented by jsdom — we install a minimal stub on the
// global before each test that exercises recording. captureStream is similarly
// missing on HTMLCanvasElement.

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType: string;
  constructor(_stream: MediaStream, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
  }
  start(_timeslice?: number): void {}
  stop(): void {
    queueMicrotask(() => {
      this.ondataavailable?.({
        data: new Blob(["x"], { type: this.mimeType }),
      });
      this.onstop?.();
    });
  }
  static isTypeSupported(m: string): boolean {
    return m === "video/webm;codecs=vp9";
  }
}

function installMediaRecorder() {
  (
    globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }
  ).MediaRecorder = FakeMediaRecorder;
}

function uninstallMediaRecorder() {
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
    undefined;
}

function makeFakeCanvas(withCaptureStream: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  if (withCaptureStream) {
    (
      c as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }
    ).captureStream = () => ({}) as MediaStream;
  }
  return c;
}

function resetRecorder() {
  useRecorderStore.setState({
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    lastBlobUrl: null,
    error: null,
  });
}

beforeEach(() => {
  resetRecorder();
  useToastStore.setState({ toasts: [] });
  (
    globalThis as unknown as {
      URL: { createObjectURL: () => string; revokeObjectURL: () => void };
    }
  ).URL = {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  };
});

afterEach(async () => {
  // Drain any internal _active recorder between tests so the singleton state
  // doesn't leak ordering dependencies.
  await useRecorderStore.getState().stop();
  uninstallMediaRecorder();
});

describe("recorder store", () => {
  it("start() surfaces an error when MediaRecorder is unavailable", async () => {
    uninstallMediaRecorder();
    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    expect(useRecorderStore.getState().status).toBe("idle");
    expect(useRecorderStore.getState().error).toMatch(/MediaRecorder/);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("start() surfaces an error when captureStream is missing", async () => {
    installMediaRecorder();
    const canvas = makeFakeCanvas(false);
    await useRecorderStore.getState().start(canvas, 30);
    expect(useRecorderStore.getState().status).toBe("idle");
    expect(useRecorderStore.getState().error).toMatch(/captureStream/);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("start() transitions to recording on success", async () => {
    installMediaRecorder();
    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    expect(useRecorderStore.getState().status).toBe("recording");
    expect(useRecorderStore.getState().startedAt).toBeTypeOf("number");
    expect(useRecorderStore.getState().error).toBeNull();
  });

  it("start() is a no-op while already recording", async () => {
    installMediaRecorder();
    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    const startedAt = useRecorderStore.getState().startedAt;
    await useRecorderStore.getState().start(canvas, 30);
    expect(useRecorderStore.getState().startedAt).toBe(startedAt);
  });

  it("stop() returns null when no recording is active", async () => {
    resetRecorder();
    const result = await useRecorderStore.getState().stop();
    expect(result).toBeNull();
  });

  it("stop() produces a blob URL and resets status to idle", async () => {
    installMediaRecorder();
    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    const blob = await useRecorderStore.getState().stop();
    expect(blob).toBeInstanceOf(Blob);
    expect(useRecorderStore.getState().status).toBe("idle");
    expect(useRecorderStore.getState().lastBlobUrl).toBe("blob:mock-url");
  });

  it("clearLast() revokes the existing blob URL and clears the slot", async () => {
    installMediaRecorder();
    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    await useRecorderStore.getState().stop();
    expect(useRecorderStore.getState().lastBlobUrl).toBe("blob:mock-url");
    useRecorderStore.getState().clearLast();
    expect(useRecorderStore.getState().lastBlobUrl).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("tick() updates elapsedMs only while recording", async () => {
    resetRecorder();
    useRecorderStore.getState().tick();
    expect(useRecorderStore.getState().elapsedMs).toBe(0);

    installMediaRecorder();
    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    useRecorderStore.getState().tick();
    // elapsed reflects performance.now() - startedAt — non-negative.
    expect(useRecorderStore.getState().elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("start() surfaces an error when MediaRecorder construction throws", async () => {
    class ThrowingMediaRecorder {
      constructor(_s: MediaStream, _o: { mimeType: string }) {
        throw new Error("codec init failed");
      }
      static isTypeSupported() {
        return true;
      }
    }
    (
      globalThis as unknown as { MediaRecorder: typeof ThrowingMediaRecorder }
    ).MediaRecorder = ThrowingMediaRecorder;

    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    expect(useRecorderStore.getState().status).toBe("idle");
    expect(useRecorderStore.getState().error).toMatch(/codec init failed/);
  });

  it("start() returns null when MediaRecorder.isTypeSupported rejects every candidate", async () => {
    // pickMimeType() returns null before instantiation, so this only needs the
    // static probe to exist; expose it as a callable shaped like MediaRecorder.
    const NoTypesMediaRecorder = function NoTypesMediaRecorder() {
      throw new Error("should not be constructed");
    };
    NoTypesMediaRecorder.isTypeSupported = () => false;
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      NoTypesMediaRecorder;

    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    expect(useRecorderStore.getState().status).toBe("idle");
    expect(useRecorderStore.getState().error).toMatch(/MediaRecorder/);
  });

  it("stop() resolves null when recorder.stop() throws", async () => {
    class ThrowingStopMediaRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      mimeType: string;
      constructor(_s: MediaStream, o: { mimeType: string }) {
        this.mimeType = o.mimeType;
      }
      start(_t?: number) {}
      stop() {
        throw new Error("hardware busy");
      }
      static isTypeSupported() {
        return true;
      }
    }
    (
      globalThis as unknown as {
        MediaRecorder: typeof ThrowingStopMediaRecorder;
      }
    ).MediaRecorder = ThrowingStopMediaRecorder;

    const canvas = makeFakeCanvas(true);
    await useRecorderStore.getState().start(canvas, 30);
    const result = await useRecorderStore.getState().stop();
    expect(result).toBeNull();
    expect(useRecorderStore.getState().status).toBe("idle");
  });
});
