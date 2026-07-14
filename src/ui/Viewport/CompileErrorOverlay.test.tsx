import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { useSelectionStore } from "../../state/selectionStore";
import { CompileErrorOverlay } from "./CompileErrorOverlay";

const initialDiagnostics = useDiagnosticsStore.getState();
const initialEditor = useEditorStore.getState();
const initialRenderer = useRendererStore.getState();

const FRAGMENT_SOURCE = [
  "#version 300 es",
  "precision mediump float;",
  "in vec2 v_uv;",
  "out vec4 fragColor;",
  "void main() {",
  "  fragColor = vec4(v_uv, 0.0, u_missing);",
  "}",
].join("\n");

function seedFragmentError() {
  useGraphStore.getState().setGraph({
    nodes: [
      {
        id: "s1",
        kind: "shader",
        vertexSource: "void main() {}",
        fragmentSource: FRAGMENT_SOURCE,
        uniformValues: {},
      },
    ],
    edges: [],
  });
  useDiagnosticsStore.getState().set("s1", {
    vertex: [],
    fragment: [{ line: 6, severity: "error", message: "undeclared u_missing" }],
    link: [],
  });
  useRendererStore.getState().setPanes([]);
}

function resetStores() {
  useDiagnosticsStore.setState(initialDiagnostics, true);
  useEditorStore.setState(initialEditor, true);
  useRendererStore.setState(initialRenderer, true);
  useGraphStore.getState().reset();
  useSelectionStore.getState().select(null);
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

describe("CompileErrorOverlay", () => {
  it("renders the overlay with the node/stage title and error count when the plan has zero panes", () => {
    seedFragmentError();
    render(<CompileErrorOverlay />);

    const root = screen.getByTestId("viewport-compile-error");
    expect(root).toBeTruthy();
    expect(screen.getByText("Shader failed to compile")).toBeTruthy();
    expect(screen.getByText(/shader · s1/)).toBeTruthy();
    expect(screen.getByText(/1 error/)).toBeTruthy();
  });

  it("renders the footer log line with a single severity prefix (dc L237)", () => {
    seedFragmentError();
    render(<CompileErrorOverlay />);

    // Exact match: formatDiagnosticRaw already prepends "ERROR:", so the
    // footer must not add a second one ("ERROR: ERROR: ..." regression).
    const footer = document.querySelector(".vp-error-footer");
    expect(footer?.textContent).toBe("ERROR: 0:6: undeclared u_missing");
  });

  it("renders nothing when at least one Output pane is still drawable", () => {
    seedFragmentError();
    useRendererStore
      .getState()
      .setPanes([{ outputNodeId: "o1", sourceNodeId: "s1" }]);
    const { container } = render(<CompileErrorOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when there is no error-severity diagnostic", () => {
    useGraphStore.getState().setGraph({
      nodes: [
        {
          id: "s1",
          kind: "shader",
          vertexSource: "void main() {}",
          fragmentSource: "void main() {}",
          uniformValues: {},
        },
      ],
      edges: [],
    });
    useRendererStore.getState().setPanes([]);
    const { container } = render(<CompileErrorOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking Jump to line selects the node, switches the editor stage, and requests a jump", () => {
    seedFragmentError();
    render(<CompileErrorOverlay />);

    const jumpBtn = screen.getByTestId("compile-error-jump");
    expect(jumpBtn.textContent).toBe("Jump to line 6");
    fireEvent.click(jumpBtn);

    expect(useSelectionStore.getState().selectedNodeId).toBe("s1");
    expect(useEditorStore.getState().activeStage).toBe("fragment");
    expect(useEditorStore.getState().jumpRequest).toMatchObject({
      nodeId: "s1",
      stage: "fragment",
      line: 6,
    });
  });

  it("clicking Copy log writes the node's error-severity diagnostics to the clipboard", () => {
    seedFragmentError();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<CompileErrorOverlay />);
    fireEvent.click(screen.getByTestId("compile-error-copy"));

    expect(writeText).toHaveBeenCalledWith("ERROR: 0:6: undeclared u_missing");
  });

  it("shows 'Open in editor' and no code card for a lineless link-stage failure", () => {
    useGraphStore.getState().setGraph({
      nodes: [
        {
          id: "s1",
          kind: "shader",
          vertexSource: "void main() {}",
          fragmentSource: "void main() {}",
          uniformValues: {},
        },
      ],
      edges: [],
    });
    useDiagnosticsStore.getState().set("s1", {
      vertex: [],
      fragment: [],
      link: [{ line: 1, severity: "error", message: "link failed" }],
    });
    useRendererStore.getState().setPanes([]);

    render(<CompileErrorOverlay />);
    expect(screen.getByTestId("compile-error-jump").textContent).toBe(
      "Open in editor",
    );
    expect(document.querySelector(".vp-error-card")).toBeNull();

    fireEvent.click(screen.getByTestId("compile-error-jump"));
    expect(useSelectionStore.getState().selectedNodeId).toBe("s1");
    expect(useEditorStore.getState().activeStage).toBe("fragment");
    expect(useEditorStore.getState().jumpRequest).toBeNull();
  });
});
