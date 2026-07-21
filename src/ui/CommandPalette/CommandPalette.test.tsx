import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import starterFrag from "../../shaders/templates/starter.frag?raw";
import { useCommandPaletteStore } from "../../state/commandPaletteStore";
import { useEditorStore } from "../../state/editorStore";
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
  useEditorStore.setState({ autoCode: true });
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

    // Command-mode pool is exactly [group-selected, graph-clear,
    // toggle-code-auto-open] in that push order; ArrowDown from 0 selects
    // the second entry (graph-clear), whose run() resets the graph store.
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
    expect(screen.getByText("3 results")).not.toBeNull();
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

  // [Q1] Palette starter item — dc Command Palette L202.
  it("starter 'Add Shader' item renders with its sub text and runs starter.frag", () => {
    openPalette();
    render(<CommandPalette />);

    const sub = screen.getByText("starter · links with or without a mesh");
    const button = sub.closest("button");
    expect(button).not.toBeNull();

    fireEvent.click(button as HTMLButtonElement);

    const created = useGraphStore
      .getState()
      .nodes.find((n) => n.kind === "shader");
    expect(created).not.toBeUndefined();
    expect(created?.kind === "shader" ? created.fragmentSource : "").toBe(
      starterFrag,
    );
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  // [Q1] Unlit-only ⚠ needs Mesh amber badge — dc Command Palette L105.
  it("only the Unlit row shows the ⚠ needs Mesh amber badge", () => {
    openPalette();
    const { container } = render(<CommandPalette />);

    const badges = container.querySelectorAll(".cmdk-warn-badge");
    expect(badges).toHaveLength(1);
    const badge = badges[0];
    expect(badge?.textContent).toBe("⚠ needs Mesh");

    const unlitRow = badge?.closest("button");
    expect(unlitRow).not.toBeNull();
    expect(unlitRow?.textContent).toContain("Add Shader: Unlit");
    expect(unlitRow?.textContent).toContain("reads surface normals");
    expect(unlitRow?.textContent).toContain("◇");

    const starterSub = screen.getByText(
      "starter · links with or without a mesh",
    );
    const starterRow = starterSub.closest("button");
    expect(starterRow?.textContent).toContain("◆");
    expect(starterRow?.querySelector(".cmdk-warn-badge")).toBeNull();
  });

  // [X2] dc Command Palette L224 — palette reachability for the Auto-open
  // toggle even when the Code rail is collapsed (34px, no inline toggle).
  it("Toggle Code auto-open command flips editorStore.autoCode and closes the palette", () => {
    openPalette();
    render(<CommandPalette />);

    const sub = screen.getByText(
      "open Code on Shader/Compute selection — reachable even when the Code rail is collapsed",
    );
    const button = sub.closest("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Toggle Code auto-open");
    expect(button?.textContent).toContain("◉");

    expect(useEditorStore.getState().autoCode).toBe(true);
    fireEvent.click(button as HTMLButtonElement);

    expect(useEditorStore.getState().autoCode).toBe(false);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});
