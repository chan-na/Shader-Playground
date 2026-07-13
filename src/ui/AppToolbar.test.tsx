import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
