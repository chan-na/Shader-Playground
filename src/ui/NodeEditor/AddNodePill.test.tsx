import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_OUTPUTS } from "../../core/graph/validate";
import { useCommandPaletteStore } from "../../state/commandPaletteStore";
import { useGraphStore } from "../../state/graphStore";
import { useHistoryStore } from "../../state/historyStore";
import { useSelectionStore } from "../../state/selectionStore";
import { AddNodePill } from "./AddNodePill";

// Setup order matches AppToolbar.test.tsx:1-24 — reset() itself pushes the
// pre-reset state onto history, so clear() must run after it.
beforeEach(() => {
  useGraphStore.getState().reset();
  useHistoryStore.getState().clear();
  useSelectionStore.getState().select(null);
  useCommandPaletteStore.getState().setOpen(false);
});

afterEach(() => {
  cleanup();
});

describe("AddNodePill", () => {
  it("Mesh click adds a mesh node and selects it", () => {
    render(<AddNodePill />);
    fireEvent.click(screen.getByRole("button", { name: "Mesh" }));

    const nodes = useGraphStore.getState().nodes;
    const added = nodes.filter((n) => n.kind === "mesh");
    expect(added).toHaveLength(1);
    expect(useSelectionStore.getState().selectedNodeId).toBe(added[0]?.id);
  });

  it("Image click adds an image node and selects it", () => {
    render(<AddNodePill />);
    fireEvent.click(screen.getByRole("button", { name: "Image" }));

    const nodes = useGraphStore.getState().nodes;
    const added = nodes.filter((n) => n.kind === "image");
    expect(added).toHaveLength(1);
    expect(useSelectionStore.getState().selectedNodeId).toBe(added[0]?.id);
  });

  it("Shader click adds a shader node (non-empty fragmentSource) and selects it", () => {
    render(<AddNodePill />);
    fireEvent.click(screen.getByRole("button", { name: "Shader" }));

    const nodes = useGraphStore.getState().nodes;
    const added = nodes.find((n) => n.kind === "shader");
    expect(added).toBeDefined();
    expect(added?.kind === "shader" && added.fragmentSource.length > 0).toBe(
      true,
    );
    expect(useSelectionStore.getState().selectedNodeId).toBe(added?.id);
  });

  it("Output click on an empty graph adds an output node and selects it", () => {
    render(<AddNodePill />);
    fireEvent.click(screen.getByRole("button", { name: "Output" }));

    const nodes = useGraphStore.getState().nodes;
    const added = nodes.filter((n) => n.kind === "output");
    expect(added).toHaveLength(1);
    expect(useSelectionStore.getState().selectedNodeId).toBe(added[0]?.id);
  });

  it("Output button is disabled once MAX_OUTPUTS is reached", () => {
    for (let i = 0; i < MAX_OUTPUTS; i++) {
      useGraphStore
        .getState()
        .addNode({ id: `output-${i}`, kind: "output" }, { x: 0, y: i * 10 });
    }
    render(<AddNodePill />);
    const outputBtn = screen.getByRole("button", { name: "Output" });
    expect(outputBtn.hasAttribute("disabled")).toBe(true);
  });

  it("＋ More click opens the command palette", () => {
    render(<AddNodePill />);
    expect(useCommandPaletteStore.getState().open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "＋ More" }));

    expect(useCommandPaletteStore.getState().open).toBe(true);
  });
});
