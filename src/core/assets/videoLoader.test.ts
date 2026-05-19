import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadVideoFromFile } from "./videoLoader";

// We never let jsdom actually try to load a Blob URL — it would never fire
// loadedmetadata. Instead we hijack document.createElement("video") and
// return a fake element whose src setter triggers the scripted outcome.
type FakeVideo = HTMLVideoElement & {
  __dispatch: (event: "loadedmetadata" | "error") => void;
  __mediaError: MediaError | null;
  __videoWidth: number;
  __videoHeight: number;
  __duration: number;
};

interface FakeOptions {
  width?: number;
  height?: number;
  duration?: number;
  error?: { code: number; message?: string } | null;
  // "src-assign" fires on .src setter (default). "manual" never auto-fires —
  // useful for testing the timeout branch.
  trigger?: "src-assign" | "manual";
  outcome?: "loadedmetadata" | "error";
}

const fakeVideos: FakeVideo[] = [];
let originalCreateElement: typeof document.createElement;

function installFakeVideo(opts: FakeOptions = {}) {
  const {
    width = 1920,
    height = 1080,
    duration = 10,
    error = null,
    trigger = "src-assign",
    outcome = error ? "error" : "loadedmetadata",
  } = opts;

  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag !== "video")
      return originalCreateElement.call(document, tag, options);

    const listeners: Record<string, Array<(ev: Event) => void>> = {};
    let srcValue = "";
    const dispatch = (event: "loadedmetadata" | "error") => {
      const arr = listeners[event];
      if (!arr) return;
      for (const fn of [...arr]) fn(new Event(event));
    };
    const fake = {
      preload: "",
      muted: false,
      playsInline: false,
      videoWidth: width,
      videoHeight: height,
      duration,
      error: error
        ? ({ code: error.code, message: error.message ?? "" } as MediaError)
        : null,
      get src() {
        return srcValue;
      },
      set src(value: string) {
        srcValue = value;
        if (trigger === "src-assign") {
          // queueMicrotask to mirror real-browser async dispatch.
          queueMicrotask(() => dispatch(outcome));
        }
      },
      addEventListener(
        type: string,
        listener: (ev: Event) => void,
        opts2?: AddEventListenerOptions,
      ) {
        const wrapped = opts2?.once
          ? (ev: Event) => {
              const arr = listeners[type];
              if (arr) {
                const idx = arr.indexOf(wrapped);
                if (idx >= 0) arr.splice(idx, 1);
              }
              listener(ev);
            }
          : listener;
        let bucket = listeners[type];
        if (!bucket) {
          bucket = [];
          listeners[type] = bucket;
        }
        bucket.push(wrapped);
      },
      removeEventListener(type: string, listener: (ev: Event) => void) {
        const arr = listeners[type];
        if (!arr) return;
        const idx = arr.indexOf(listener);
        if (idx >= 0) arr.splice(idx, 1);
      },
      removeAttribute(_name: string) {
        // no-op
      },
      load() {
        // no-op
      },
      __dispatch: dispatch,
      __mediaError: error
        ? ({ code: error.code, message: error.message ?? "" } as MediaError)
        : null,
      __videoWidth: width,
      __videoHeight: height,
      __duration: duration,
    } as unknown as FakeVideo;

    fakeVideos.push(fake);
    return fake as unknown as HTMLElement;
  }) as typeof document.createElement;
}

beforeEach(() => {
  originalCreateElement = document.createElement.bind(document);
  fakeVideos.length = 0;
  // jsdom URL.createObjectURL / revokeObjectURL exist but are no-ops; that's fine.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:fake");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  document.createElement = originalCreateElement;
});

describe("loadVideoFromFile", () => {
  it("returns handle with width/height/duration on loadedmetadata", async () => {
    installFakeVideo({ width: 1920, height: 1080, duration: 10 });
    const file = new File([new Uint8Array([0, 1, 2, 3])], "clip.mp4", {
      type: "video/mp4",
    });

    const { handle, blob } = await loadVideoFromFile(file);

    expect(handle.width).toBe(1920);
    expect(handle.height).toBe(1080);
    expect(handle.duration).toBe(10);
    expect(handle.name).toBe("clip.mp4");
    expect(handle.mimeType).toBe("video/mp4");
    expect(blob).toBe(file);
  });

  it("falls back to extension-derived MIME and re-wraps the blob when file.type is empty", async () => {
    installFakeVideo();
    const createObjSpy = vi.spyOn(URL, "createObjectURL");
    const file = new File([new Uint8Array([0, 1, 2, 3])], "clip.mp4", {
      type: "",
    });

    const { handle } = await loadVideoFromFile(file);

    expect(handle.mimeType).toBe("video/mp4");
    const blobPassed = createObjSpy.mock.calls[0]?.[0] as Blob;
    expect(blobPassed).toBeDefined();
    // We re-wrapped into a typed Blob, so it's a *different* object than the original File.
    expect(blobPassed).not.toBe(file);
    expect(blobPassed.type).toBe("video/mp4");
    createObjSpy.mockRestore();
  });

  it("derives MIME from .webm / .mov extensions when type missing", async () => {
    installFakeVideo();
    const webm = new File([new Uint8Array()], "vid.webm", { type: "" });
    const { handle: h1 } = await loadVideoFromFile(webm);
    expect(h1.mimeType).toBe("video/webm");

    installFakeVideo();
    const mov = new File([new Uint8Array()], "vid.MOV", { type: "" });
    const { handle: h2 } = await loadVideoFromFile(mov);
    expect(h2.mimeType).toBe("video/quicktime");
  });

  it("includes MediaError code name and message in the rejection", async () => {
    installFakeVideo({
      error: { code: 4, message: "Format error" },
    });
    const file = new File([new Uint8Array()], "broken.mp4", {
      type: "video/mp4",
    });

    await expect(loadVideoFromFile(file)).rejects.toThrow(
      /MEDIA_ERR_SRC_NOT_SUPPORTED.*Format error/,
    );
  });

  it("reports 'unknown' detail when the video element exposes no MediaError", async () => {
    installFakeVideo({ trigger: "manual", outcome: "error" });
    const file = new File([new Uint8Array()], "weird.mp4", {
      type: "video/mp4",
    });

    const promise = loadVideoFromFile(file);
    // Trigger the error event without a MediaError attached.
    queueMicrotask(() => fakeVideos[0]?.__dispatch("error"));

    await expect(promise).rejects.toThrow(/failed to decode video metadata/);
    await expect(promise).rejects.toThrow(/unknown/);
  });
});
