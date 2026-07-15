import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_OUTPUTS } from "../core/graph/validate";
import { useCommandPaletteStore } from "../state/commandPaletteStore";
import { useGifRecorderStore } from "../state/gifRecorder";
import { useGraphStore } from "../state/graphStore";
import { useHistoryStore } from "../state/historyStore";
import { AppToolbar } from "./AppToolbar";

beforeEach(() => {
  // Same reset order as graphStore.test.ts: reset() itself pushes the
  // pre-reset state onto history, so clear() must run after it to leave
  // both stores genuinely empty.
  useGraphStore.getState().reset();
  useHistoryStore.getState().clear();
  useCommandPaletteStore.getState().setOpen(false);
});

afterEach(() => {
  cleanup();
});

describe("AppToolbar", () => {
  it("Mesh button adds a mesh node to the graph store", () => {
    render(<AppToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Mesh" }));
    const nodes = useGraphStore.getState().nodes;
    expect(nodes.filter((n) => n.kind === "mesh")).toHaveLength(1);
  });

  it("+ More menu lists Webcam…Time, and Float adds a param node and closes the menu", () => {
    render(<AppToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "＋ More" }));

    expect(screen.getByRole("menuitem", { name: "Webcam" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Time" })).not.toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Float" }));

    const nodes = useGraphStore.getState().nodes;
    expect(
      nodes.some((n) => n.kind === "param" && n.paramKind === "float"),
    ).toBe(true);
    // Menu closed after the click.
    expect(screen.queryByRole("menuitem", { name: "Float" })).toBeNull();
  });

  it("Presets menu → Chain loads the chain demo graph (tonemap1 present)", () => {
    render(<AppToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Presets" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Chain" }));

    const nodes = useGraphStore.getState().nodes;
    expect(nodes.some((n) => n.id === "tonemap1")).toBe(true);
  });

  it("Output button is disabled once MAX_OUTPUTS is reached", () => {
    for (let i = 0; i < MAX_OUTPUTS; i++) {
      useGraphStore
        .getState()
        .addNode({ id: `output-${i}`, kind: "output" }, { x: 0, y: i * 10 });
    }
    render(<AppToolbar />);
    const outputBtn = screen.getByRole("button", { name: "Output" });
    expect(outputBtn.hasAttribute("disabled")).toBe(true);
  });

  it("Undo/Redo are disabled when history is empty", () => {
    render(<AppToolbar />);
    expect(
      screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Redo" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it('GIF button aria-label is "Start recording viewport to animated GIF" while idle', () => {
    useGifRecorderStore.setState({ status: "idle", encodeProgress: 0 });
    render(<AppToolbar />);
    expect(
      screen.getByRole("button", {
        name: "Start recording viewport to animated GIF",
      }),
    ).not.toBeNull();
  });

  it("Search button opens the command palette store", () => {
    render(<AppToolbar />);
    expect(useCommandPaletteStore.getState().open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });

  it(
    "Export JSON menuitem downloads a filename matching the unified " +
      "export naming rule [D16], same as the Export & Share dialog",
    () => {
      // jsdom omits URL.createObjectURL / revokeObjectURL — stub them so the
      // handler can run end-to-end (pattern: htmlExport.test.ts L129-141).
      const createObjectURL = vi.fn(() => "blob:fake-url");
      const revokeObjectURL = vi.fn();
      (
        URL as unknown as { createObjectURL: typeof createObjectURL }
      ).createObjectURL = createObjectURL;
      (
        URL as unknown as { revokeObjectURL: typeof revokeObjectURL }
      ).revokeObjectURL = revokeObjectURL;

      // Intercept anchors so we can capture the download name that was set
      // without actually navigating (pattern: htmlExport.test.ts L152-168).
      let capturedDownload: string | undefined;
      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      const createSpy = vi
        .spyOn(document, "createElement")
        .mockImplementation((tag: string) => {
          const el = origCreateElement(tag);
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
        });

      render(<AppToolbar />);
      fireEvent.click(screen.getByRole("button", { name: "＋ More" }));
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Export project as JSON" }),
      );

      expect(capturedDownload).toMatch(/^untitled-project-\d{8}-\d{4}\.json$/);
      expect(clickSpy).toHaveBeenCalledTimes(1);

      createSpy.mockRestore();
    },
  );
});
