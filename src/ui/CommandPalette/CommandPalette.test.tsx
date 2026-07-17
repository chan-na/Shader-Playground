import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "../../state/commandPaletteStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { CommandPalette } from "./index";

function openPalette() {
  useCommandPaletteStore.setState({ open: true });
}

function getInput(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

beforeEach(() => {
  useGraphStore.getState().reset();
  useCommandPaletteStore.getState().setOpen(false);
  useSelectionStore.getState().select(null);
});

afterEach(() => {
  cleanup();
});

describe("CommandPalette", () => {
  it("groups the default (empty-query) results under Nodes/Commands/Presets", () => {
    openPalette();
    render(<CommandPalette />);
    expect(screen.getByText("Nodes")).not.toBeNull();
    expect(screen.getByText("Commands")).not.toBeNull();
    expect(screen.getByText("Presets")).not.toBeNull();
  });

  it("'@' prefix narrows results to the Nodes group only", () => {
    openPalette();
    const { container } = render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: "@tor" } });
    expect(screen.getByText("Nodes")).not.toBeNull();
    expect(screen.queryByText("Commands")).toBeNull();
    expect(screen.queryByText("Presets")).toBeNull();
    // Fuzzy-matched labels highlight the matched run(s) in a
    // `.cmdk-seg--hit` span (e.g. "Add Mesh: <b>tor</b>us").
    expect(container.querySelectorAll(".cmdk-seg--hit").length).toBeGreaterThan(
      0,
    );
  });

  it("'>' prefix narrows results to the Commands group only", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: ">" } });
    expect(screen.queryByText("Nodes")).toBeNull();
    expect(screen.getByText("Commands")).not.toBeNull();
    expect(screen.queryByText("Presets")).toBeNull();
  });

  it("Tab cycles the query through the @ / > / / mode prefixes", () => {
    openPalette();
    render(<CommandPalette />);
    const input = getInput();

    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("@");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe(">");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("/");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("");
  });

  it("ArrowDown + Enter runs the selected command and closes the palette", () => {
    useGraphStore
      .getState()
      .addNode({ id: "probe", kind: "output" }, { x: 0, y: 0 });
    openPalette();
    render(<CommandPalette />);
    const input = getInput();

    // Command-mode pool is exactly [group-selected, graph-clear] in that
    // push order; ArrowDown from 0 selects the second entry (graph-clear),
    // whose run() resets the graph store.
    fireEvent.change(input, { target: { value: ">" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useGraphStore.getState().nodes).toHaveLength(0);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("shows a 'No matches' empty state for a query with no hits", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: "zzzzzznomatch" } });
    expect(screen.getByText(/No matches for/)).not.toBeNull();
  });

  it("empty-result CTA creates a named Shader node on Enter", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: "my glow pass" } });
    const cta = screen.getByTestId("cmdk-create-cta");
    expect(cta.textContent).toContain("my glow pass");

    fireEvent.keyDown(getInput(), { key: "Enter" });

    const created = useGraphStore
      .getState()
      .nodes.find((n) => n.kind === "shader" && n.name === "my glow pass");
    expect(created).not.toBeUndefined();
    expect(useSelectionStore.getState().selectedNodeId).toBe(created?.id);
    expect(useCommandPaletteStore.getState().open).toBe(false);

    // [C-7] The node is born with no mesh input, so compile.ts compiles it
    // against fullscreen.vert (which emits v_uv only). A template reading
    // v_normal (unlit.frag) could never link on the first frame — exactly the
    // "new node is instantly in an error state" defect. Pin the CTA to a
    // fullscreen-safe template so it cannot regress to unlit. Match on
    // *declared* varyings, not raw text: a template may legitimately mention
    // v_normal in a comment explaining why it avoids it.
    const frag = created?.kind === "shader" ? created.fragmentSource : "";
    const fragIns = [...frag.matchAll(/^\s*in\s+\w+\s+(\w+)\s*;/gm)].map(
      (m) => m[1],
    );
    expect(fragIns).not.toContain("v_normal");
    expect(fragIns).toContain("v_uv");
  });

  it("clicking the CTA row also creates the node", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: "my glow pass" } });
    fireEvent.click(screen.getByTestId("cmdk-create-cta"));

    const created = useGraphStore
      .getState()
      .nodes.find((n) => n.kind === "shader" && n.name === "my glow pass");
    expect(created).not.toBeUndefined();
    expect(useSelectionStore.getState().selectedNodeId).toBe(created?.id);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("CTA is absent when there are results", () => {
    openPalette();
    render(<CommandPalette />);
    expect(screen.queryByTestId("cmdk-create-cta")).toBeNull();
  });

  it("shows the total result count in the footer", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: ">" } });
    expect(screen.getByText("2 results")).not.toBeNull();
  });

  it("reopening via store.setOpen(true) clears the previous query and active row", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: "@tor" } });
    expect(getInput().value).toBe("@tor");

    act(() => {
      useCommandPaletteStore.getState().setOpen(false);
    });
    act(() => {
      useCommandPaletteStore.getState().setOpen(true);
    });

    expect(getInput().value).toBe("");
    expect(screen.getByText("Nodes")).not.toBeNull();
    expect(screen.getByText("Commands")).not.toBeNull();
    expect(screen.getByText("Presets")).not.toBeNull();
  });
});
