import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "../../state/commandPaletteStore";
import { useGraphStore } from "../../state/graphStore";
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

  it("shows the total result count in the footer", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.change(getInput(), { target: { value: ">" } });
    expect(screen.getByText("2 results")).not.toBeNull();
  });
});
