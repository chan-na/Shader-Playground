import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCommandPaletteStore } from "../state/commandPaletteStore";
import { useDockStore } from "../state/dockStore";
import { collectPanelIds } from "../state/dockTree";
import { useGifRecorderStore } from "../state/gifRecorder";
import { useGraphStore } from "../state/graphStore";
import { useHistoryStore } from "../state/historyStore";
import { useRendererStore } from "../state/rendererStore";
import { useToastStore } from "../state/toastStore";
import { AppToolbar } from "./AppToolbar";

beforeEach(() => {
  // Same reset order as graphStore.test.ts: reset() itself pushes the
  // pre-reset state onto history, so clear() must run after it to leave
  // both stores genuinely empty.
  useGraphStore.getState().reset();
  useHistoryStore.getState().clear();
  useCommandPaletteStore.getState().setOpen(false);
  useDockStore.getState().resetLayout();
  // The Snap PNG tests below assert on both of these, and neither store is
  // reset by the others' helpers. `canvasSize` starts at a real drawing buffer
  // so only `ready` decides the F1 cases; the F21 cases floor it themselves.
  useRendererStore.setState({
    ready: false,
    snapshotRequested: false,
    canvasSize: { width: 800, height: 600 },
  });
  useToastStore.getState().clear();
});

afterEach(() => {
  cleanup();
});

describe("AppToolbar", () => {
  it("toolbar no longer renders node-add buttons (W4 — moved to the canvas pill)", () => {
    render(<AppToolbar />);
    expect(screen.queryByRole("button", { name: "Mesh" })).toBeNull();
    expect(screen.queryByRole("button", { name: "＋ More" })).toBeNull();
  });

  it("File menu lists Load…/Import JSON/Export JSON/Snap PNG", () => {
    render(<AppToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));

    expect(
      screen.getByRole("menuitem", {
        name: "Import OBJ, GLTF, image, video, or audio files",
      }),
    ).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Import project from JSON" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Export project as JSON" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Save viewport as PNG" }),
    ).not.toBeNull();
  });

  it("Presets menu → Chain loads the chain demo graph (tonemap1 present)", () => {
    render(<AppToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Presets" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Chain" }));

    const nodes = useGraphStore.getState().nodes;
    expect(nodes.some((n) => n.id === "tonemap1")).toBe(true);
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
      fireEvent.click(screen.getByRole("button", { name: "File" }));
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Export project as JSON" }),
      );

      expect(capturedDownload).toMatch(/^untitled-project-\d{8}-\d{4}\.json$/);
      expect(clickSpy).toHaveBeenCalledTimes(1);

      createSpy.mockRestore();
    },
  );
});

// F1 — the call site, not just the store. `Viewport/index.tsx` has 0% line
// coverage, so nothing else in `npm run check` observes how the toolbar reacts
// to a refused snapshot request. These drive the real menu item.
describe("AppToolbar — Snap PNG guard (F1)", () => {
  const clickSnapPng = () => {
    render(<AppToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Save viewport as PNG" }),
    );
  };

  it("arms the request and stays quiet while a render loop is running", () => {
    useRendererStore.getState().setReady(true);
    clickSnapPng();

    expect(useRendererStore.getState().snapshotRequested).toBe(true);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("with the Viewport unmounted: reports the refusal and arms nothing", () => {
    // `ready === false` is the panel-closed state — there is no RAF loop to read
    // the drawing buffer. Arming the flag anyway is what made a later remount
    // download an unrequested PNG.
    clickSnapPng();

    expect(useRendererStore.getState().snapshotRequested).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.kind).toBe("error");
    expect(toasts[0]?.message).toContain("Viewport");
    // The two refusals must not read the same: this one is "the panel is gone",
    // and telling the user to expand a rail here would be wrong.
    expect(toasts[0]?.message).toContain("열어");
  });

  // F21 — mounted, looping, but hidden behind `display:none`. `ready` is true,
  // so F1's guard passes; the drawing buffer is floored at 1×1 and the capture
  // produced a 1×1 PNG. This pins the *call site*: the store can be right about
  // refusing while the toolbar still drops the refusal or mislabels it.
  it("with the Viewport collapsed: refuses and says to expand it, not open it", () => {
    useRendererStore.setState({
      ready: true,
      canvasSize: { width: 1, height: 1 },
    });
    clickSnapPng();

    expect(useRendererStore.getState().snapshotRequested).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.kind).toBe("error");
    expect(toasts[0]?.message).toContain("펼쳐");
    // F1's wording ("open the Viewport panel") is actively misleading here —
    // the panel *is* open. Guarding the negative keeps the branch honest.
    expect(toasts[0]?.message).not.toContain("열어");
  });
});

describe("AppToolbar — ＋ Panel / Reset layout (B6-U2)", () => {
  it("＋ Panel menu shows 'All panels are open' when every panel is docked", () => {
    render(<AppToolbar />);
    fireEvent.click(screen.getByTestId("dock-add-panel"));
    expect(screen.getByText("All panels are open")).not.toBeNull();
  });

  it("＋ Panel menu lists a closed panel and re-docks it on click, closing the menu", () => {
    useDockStore.getState().closeTab("assets");
    render(<AppToolbar />);
    fireEvent.click(screen.getByTestId("dock-add-panel"));

    const item = screen.getByTestId("dock-add-panel-assets");
    expect(item.textContent).toContain("Assets");

    fireEvent.click(item);

    expect(collectPanelIds(useDockStore.getState().tree)).toContain("assets");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Reset layout restores the default 5-panel tree after closing several tabs", () => {
    useDockStore.getState().closeTab("assets");
    useDockStore.getState().closeTab("code");
    render(<AppToolbar />);

    fireEvent.click(screen.getByTestId("dock-reset-layout"));

    const ids = collectPanelIds(useDockStore.getState().tree);
    expect(new Set(ids)).toEqual(
      new Set(["nodeEditor", "viewport", "inspector", "code", "assets"]),
    );
    expect(ids).toHaveLength(5);
  });
});
