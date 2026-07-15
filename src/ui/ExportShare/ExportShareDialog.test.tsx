import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExportShareStore } from "../../state/exportShareStore";
import { useGifRecorderStore } from "../../state/gifRecorder";
import { useGraphStore } from "../../state/graphStore";
import { useRecorderStore } from "../../state/recorder";

const FIXED_HTML_LENGTH = 46 * 1024;
const FIXED_HTML = "x".repeat(FIXED_HTML_LENGTH);

// The dialog only needs to call these two helpers with the right args — the
// real HTML-building/download-triggering behavior is already covered by
// htmlExport.test.ts / tests/e2e/phase-11-share-export.spec.ts.
vi.mock("../../export/htmlExport", () => ({
  buildExportedHtml: vi.fn(() => FIXED_HTML),
  downloadExportedHtml: vi.fn(() => "untitled-project-20260714-1532.html"),
}));

// Likewise, encodeShareUrl's gzip/base64url encoding is covered by
// shareUrl.test.ts — this file only asserts the dialog wires success/copy.
vi.mock("../../state/shareUrl", () => ({
  encodeShareUrl: vi.fn(() => Promise.resolve("http://x/#share=abc")),
}));

import * as htmlExport from "../../export/htmlExport";
import * as shareUrlModule from "../../state/shareUrl";
import { useToastStore } from "../../state/toastStore";
import { ExportShareDialog } from "./ExportShareDialog";

const TRIVIAL_GRAPH = {
  nodes: [
    { id: "m1", kind: "mesh" as const, primitive: "sphere" as const },
    { id: "o1", kind: "output" as const },
  ],
  edges: [],
};

const writeText = vi.fn(() => Promise.resolve());

/** `.viewport-canvas` fixture the dialog's Start-recording handlers look up
 * via `document.querySelector` (mirrors AppToolbar's own lookup — this
 * dialog doesn't own a real WebGL canvas, so tests provide the DOM node the
 * same way the real app's Viewport does). */
let canvasFixture: HTMLCanvasElement | null = null;

beforeEach(() => {
  useGraphStore.getState().setGraph(TRIVIAL_GRAPH, {});
  useExportShareStore.setState({ open: false, target: "gif" });
  useToastStore.setState({ toasts: [] });
  vi.clearAllMocks();
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  useGifRecorderStore.setState({
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    frameCount: 0,
    encodeProgress: 0,
    lastBlobUrl: null,
    error: null,
  });
  useRecorderStore.setState({
    status: "idle",
    startedAt: null,
    lastBlobUrl: null,
    error: null,
  });
  (
    globalThis as unknown as {
      URL: { createObjectURL: () => string; revokeObjectURL: () => void };
    }
  ).URL = {
    createObjectURL: vi.fn(() => "blob:es-mock"),
    revokeObjectURL: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (canvasFixture) {
    canvasFixture.remove();
    canvasFixture = null;
  }
});

function installViewportCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "viewport-canvas";
  canvas.width = 1920;
  canvas.height = 1080;
  document.body.appendChild(canvas);
  canvasFixture = canvas;
  return canvas;
}

describe("ExportShareDialog", () => {
  it("renders nothing while the store is closed", () => {
    render(<ExportShareDialog />);
    expect(screen.queryByTestId("export-share-dialog")).toBeNull();
  });

  it("openWith('html') shows all 4 rail items and the HTML configure panel with a KB estimate", () => {
    useExportShareStore.getState().openWith("html");
    const { container } = render(<ExportShareDialog />);

    expect(screen.getByTestId("export-share-dialog")).not.toBeNull();
    expect(screen.getByTestId("es-rail-gif")).not.toBeNull();
    expect(screen.getByTestId("es-rail-webm")).not.toBeNull();
    expect(screen.getByTestId("es-rail-html")).not.toBeNull();
    expect(screen.getByTestId("es-rail-link")).not.toBeNull();
    // "Standalone HTML" also labels the rail item itself — scope to the
    // configure panel's title element specifically.
    expect(container.querySelector(".es-panel-title")?.textContent).toBe(
      "Standalone HTML",
    );

    const expectedKB = Math.round(FIXED_HTML_LENGTH / 1024);
    expect(
      screen.getByText(`${expectedKB} KB · WebGL2 · self-contained`),
    ).not.toBeNull();
  });

  it("Download HTML calls downloadExportedHtml with the file name and shows the done file card with the actual saved name", () => {
    useExportShareStore.getState().openWith("html");
    render(<ExportShareDialog />);

    fireEvent.click(screen.getByTestId("es-download-html"));

    expect(htmlExport.downloadExportedHtml).toHaveBeenCalledTimes(1);
    const call = vi.mocked(htmlExport.downloadExportedHtml).mock.calls[0];
    expect(call?.[2]).toBe("untitled-project");

    const card = screen.getByTestId("es-done-file-card");
    expect(card.textContent).toContain("untitled-project-20260714-1532.html");
    expect(card.textContent).not.toContain(".html.html");

    const toasts = useToastStore.getState().toasts;
    const last = toasts[toasts.length - 1];
    expect(last?.kind).toBe("success");
    expect(last?.message).toContain("untitled-project-20260714-1532.html");
  });

  it("Create link → Copy shows the URL row and 'Copied ✓' via navigator.clipboard", async () => {
    useExportShareStore.getState().openWith("link");
    render(<ExportShareDialog />);

    fireEvent.click(screen.getByTestId("es-create-link"));
    expect(shareUrlModule.encodeShareUrl).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("es-share-url")).not.toBeNull();
    expect(screen.getByTestId("es-share-url").textContent).toBe(
      "http://x/#share=abc",
    );

    fireEvent.click(screen.getByTestId("es-copy-link"));
    expect(await screen.findByText("Copied ✓")).not.toBeNull();
    expect(writeText).toHaveBeenCalledWith("http://x/#share=abc");
  });

  it("clicking a rail item switches target and resets to the configure phase", () => {
    useExportShareStore.getState().openWith("html");
    const { container } = render(<ExportShareDialog />);

    fireEvent.click(screen.getByTestId("es-download-html"));
    expect(screen.getByTestId("es-done-file-card")).not.toBeNull();

    fireEvent.click(screen.getByTestId("es-rail-link"));
    expect(useExportShareStore.getState().target).toBe("link");
    // "Share link" also labels the rail item itself, so scope the
    // configure-panel assertion to the title element specifically.
    expect(container.querySelector(".es-panel-title")?.textContent).toBe(
      "Share link",
    );
    expect(screen.queryByTestId("es-done-file-card")).toBeNull();
  });

  it("✕ and Escape both close the dialog", () => {
    useExportShareStore.getState().openWith("html");
    render(<ExportShareDialog />);

    fireEvent.click(screen.getByTestId("es-close"));
    expect(useExportShareStore.getState().open).toBe(false);

    // Re-opening via a direct store call (not a fireEvent) needs an explicit
    // act() so the Escape-listener effect re-attaches before the keydown
    // below fires — fireEvent itself already wraps clicks/keydowns in one.
    act(() => {
      useExportShareStore.getState().openWith("html");
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useExportShareStore.getState().open).toBe(false);
  });
});

describe("ExportShareDialog — Record: GIF", () => {
  it("openWith('gif') configure renders Size/FPS/Duration/Dither and an est chip that reacts to option changes", () => {
    useExportShareStore.getState().openWith("gif");
    render(<ExportShareDialog />);

    expect(screen.getByTestId("es-gif-size-480")).not.toBeNull();
    expect(screen.getByTestId("es-gif-fps-12")).not.toBeNull();
    expect(screen.getByTestId("es-gif-duration")).not.toBeNull();
    expect(screen.getByTestId("es-gif-dither")).not.toBeNull();
    // Defaults: 12fps · 480px · 4.0s -> the reference point of the estimate.
    expect(screen.getByTestId("es-gif-est").textContent).toBe("3.4 MB");

    fireEvent.click(screen.getByTestId("es-gif-size-960"));
    // Doubling the long edge quadruples the estimated area.
    expect(screen.getByTestId("es-gif-est").textContent).toBe("13.6 MB");
  });

  it("Start recording calls the gif store's start with the selected options and shows the recording panel", () => {
    installViewportCanvas();
    useExportShareStore.getState().openWith("gif");
    render(<ExportShareDialog />);

    fireEvent.click(screen.getByTestId("es-gif-fps-30"));
    fireEvent.click(screen.getByTestId("es-gif-size-240"));

    const startSpy = vi
      .spyOn(useGifRecorderStore.getState(), "start")
      .mockImplementation(() => {
        useGifRecorderStore.setState({ status: "recording" });
      });

    fireEvent.click(screen.getByTestId("es-start-recording"));

    expect(startSpy).toHaveBeenCalledWith({
      fps: 30,
      maxSeconds: 4,
      maxLongEdge: 240,
      dither: true,
    });
    expect(screen.getByTestId("es-rec-counter")).not.toBeNull();
    expect(screen.getByTestId("es-stop-recording")).not.toBeNull();
  });

  it("reflects the gif store's status directly: recording shows frame count + progress bar", () => {
    useExportShareStore.getState().openWith("gif");
    // Set before mounting — the dialog derives its displayed phase from the
    // store's live status on every render, so this is equivalent to (and
    // simpler than) an in-flight status flip once mounted.
    useGifRecorderStore.setState({
      status: "recording",
      frameCount: 12,
      elapsedMs: 2000,
    });
    render(<ExportShareDialog />);

    expect(screen.getByTestId("es-rec-counter").textContent).toBe(
      "12 frames captured",
    );
    // Default configured duration is 4s -> 2000ms elapsed is 50%.
    const fill = screen.getByTestId("es-rec-progress-fill");
    expect(fill.style.width).toBe("50%");
  });

  it("reflects the gif store's status directly: encoding shows the ring at the store's encodeProgress", () => {
    useExportShareStore.getState().openWith("gif");
    useGifRecorderStore.setState({ status: "encoding", encodeProgress: 0.5 });
    render(<ExportShareDialog />);

    expect(screen.getByTestId("es-enc-pct").textContent).toBe("50%");
  });

  it("stop resolving to a blob shows the done file card with the .gif name and size", async () => {
    useExportShareStore.getState().openWith("gif");
    useGifRecorderStore.setState({
      status: "recording",
      frameCount: 40,
      elapsedMs: 1000,
    });
    render(<ExportShareDialog />);

    const blob = new Blob(["x".repeat(2 * 1024 * 1024)], {
      type: "image/gif",
    });
    vi.spyOn(useGifRecorderStore.getState(), "stop").mockImplementation(
      async () => {
        useGifRecorderStore.setState({
          status: "idle",
          lastBlobUrl: "blob:gif-mock",
        });
        return blob;
      },
    );

    fireEvent.click(screen.getByTestId("es-stop-recording"));

    const card = await screen.findByTestId("es-done-file-card");
    expect(card.textContent).toMatch(/untitled-project-\d{8}-\d{4}\.gif/);
    // Default fps/duration (12fps · 4.0s) + the 2 MiB fixture blob.
    expect(card.textContent).toContain("2.0 MB · 12 fps · 4.0s");
  });

  it("record-done shows exactly one .es-done-actions row with [Export again | Save to disk] in that order, and Save to disk downloads the recorded file (dc L282-285: one row, not two)", async () => {
    useExportShareStore.getState().openWith("gif");
    useGifRecorderStore.setState({
      status: "recording",
      frameCount: 40,
      elapsedMs: 1000,
    });
    const { container } = render(<ExportShareDialog />);

    const blob = new Blob(["x".repeat(2 * 1024 * 1024)], {
      type: "image/gif",
    });
    vi.spyOn(useGifRecorderStore.getState(), "stop").mockImplementation(
      async () => {
        useGifRecorderStore.setState({
          status: "idle",
          lastBlobUrl: "blob:gif-mock",
        });
        return blob;
      },
    );

    fireEvent.click(screen.getByTestId("es-stop-recording"));
    await screen.findByTestId("es-done-file-card");

    // Exactly one action row (was two: DoneRecordPanel's own primary button
    // + the parent's secondary-only row) — dc's done footer is a single
    // `display:flex;gap:10px` row of [Export again, primaryDone].
    const actionRows = container.querySelectorAll(".es-done-actions");
    expect(actionRows.length).toBe(1);

    const row = actionRows[0] as HTMLElement;
    const buttons = row.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.getAttribute("data-testid")).toBe("es-export-again");
    expect(buttons[1]?.getAttribute("data-testid")).toBe("es-save-recording");
    expect(buttons[1]?.className).toContain("es-btn-primary");

    // Save to disk still downloads the recorded blob under the file name
    // shown on the done card (htmlExport.test.ts's anchor-intercept
    // pattern — observe what was clicked without actually navigating).
    let capturedDownload: string | undefined;
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tag: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tag, options);
        if (tag === "a") {
          (el as HTMLAnchorElement).click = clickSpy;
          Object.defineProperty(el, "download", {
            get: () => capturedDownload,
            set: (v: string) => {
              capturedDownload = v;
            },
          });
        }
        return el;
      },
    );

    const fileName = screen.getByTestId("es-done-file-card").textContent;
    fireEvent.click(screen.getByTestId("es-save-recording"));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(capturedDownload).toBeDefined();
    expect(fileName).toContain(capturedDownload as string);
  });

  it("auto-stops once elapsed reaches the configured duration while open", async () => {
    useExportShareStore.getState().openWith("gif");
    // Default local gifDuration is 4s (4000ms) — elapsedMs already at/over
    // that threshold should trigger the auto-stop effect on mount.
    useGifRecorderStore.setState({
      status: "recording",
      frameCount: 48,
      elapsedMs: 4000,
    });
    const stopSpy = vi
      .spyOn(useGifRecorderStore.getState(), "stop")
      .mockImplementation(async () => {
        useGifRecorderStore.setState({ status: "idle" });
        return new Blob(["x"], { type: "image/gif" });
      });

    render(<ExportShareDialog />);

    await screen.findByTestId("es-done-file-card");
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-stop a recording while the dialog itself is closed (toolbar quick-GIF regression guard, verifier M6 blocker)", () => {
    // exportShareStore defaults to { open: false, target: "gif" } (see
    // beforeEach) — this is exactly AppToolbar's quick-GIF-button shape: the
    // dialog is closed, but (being unconditionally rendered by App.tsx) its
    // hooks still run and stay subscribed to the GIF recorder store. Elapsed
    // already past this dialog's own local `gifDuration` default (4s) must
    // NOT stop/encode a recording that toolbar started independently —
    // otherwise the toolbar's own Stop button loses its recording out from
    // under it (status flips to "idle" before the user ever clicks Stop).
    useGifRecorderStore.setState({
      status: "recording",
      frameCount: 48,
      elapsedMs: 4000,
    });
    const stopSpy = vi.spyOn(useGifRecorderStore.getState(), "stop");

    render(<ExportShareDialog />);

    expect(stopSpy).not.toHaveBeenCalled();
    expect(useGifRecorderStore.getState().status).toBe("recording");
  });
});

describe("ExportShareDialog — Record: WebM", () => {
  it("openWith('webm') configure has no duration slider, only a frame-rate control", () => {
    useExportShareStore.getState().openWith("webm");
    render(<ExportShareDialog />);

    expect(screen.queryByTestId("es-gif-duration")).toBeNull();
    expect(screen.getByTestId("es-webm-fps-30")).not.toBeNull();
  });

  it("Start recording calls recorder.start(canvas, fps); missing captureStream keeps configure", async () => {
    // A minimal MediaRecorder stub so pickMimeType() succeeds and the store
    // gets far enough to hit the canvas.captureStream() check specifically
    // (jsdom's plain canvas fixture has no captureStream, unlike a real
    // WebGL viewport canvas). recorder.ts only ever calls
    // `MediaRecorder.isTypeSupported(...)` on this path (construction is
    // never reached), so a plain object stands in fine — no constructor
    // needed.
    const fakeMediaRecorder = {
      isTypeSupported: (m: string) => m === "video/webm;codecs=vp9",
    };
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      fakeMediaRecorder;

    const canvas = installViewportCanvas();
    useExportShareStore.getState().openWith("webm");
    render(<ExportShareDialog />);

    fireEvent.click(screen.getByTestId("es-webm-fps-24"));

    const startSpy = vi.spyOn(useRecorderStore.getState(), "start");

    fireEvent.click(screen.getByTestId("es-start-recording"));
    await screen.findByTestId("es-start-recording");

    expect(startSpy).toHaveBeenCalledWith(canvas, 24);
    expect(useRecorderStore.getState().status).toBe("idle");
    // Configure panel (not the recording panel) is still showing.
    expect(screen.getByTestId("es-webm-fps-24")).not.toBeNull();

    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      undefined;
  });
});
