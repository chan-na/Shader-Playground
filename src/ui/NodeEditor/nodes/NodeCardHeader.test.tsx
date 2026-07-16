import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MeshGraphNode } from "../../../core/graph/types";
import { useGraphStore } from "../../../state/graphStore";
import { tokens, withAlpha } from "../../../theme";
import { NODE_GLYPH } from "../nodeTheme";
import { NodeCardHeader } from "./NodeCardHeader";

/** Same pattern as nodeViews.test.tsx's renderInFlow — kept local since this
 * component has no Handle, but the wrapper is cheap and future-proofs against
 * a header that later grows a Handle-dependent meta slot. */
function renderInFlow(element: ReactElement): string {
  return renderToStaticMarkup(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

/** `useGraphStore` is a real live store here (not renderToStaticMarkup) —
 * the rename path calls `renameNode`, which needs a seeded node to act on
 * and is asserted via `useGraphStore.getState()` afterwards, mirroring
 * GroupInspector.test.tsx's fireEvent + getState() pattern. */
function renderRenameable(id: string, title: string) {
  const node: MeshGraphNode = {
    id,
    kind: "mesh",
    primitive: "cube",
    assetId: null,
  };
  useGraphStore.getState().addNode(node);
  return render(
    <ReactFlowProvider>
      <NodeCardHeader kind="mesh" title={title} nodeId={id} />
    </ReactFlowProvider>,
  );
}

/** Two clicks within the 350ms double-click window used by the title button. */
function doubleClickTitle() {
  const title = screen.getByTestId("node-title-text");
  fireEvent.click(title);
  fireEvent.click(title);
}

describe("NodeCardHeader", () => {
  it("renders the source category (Mesh): glyph, title, category colors", () => {
    const cat = tokens.nodeCategory.source;
    const html = renderInFlow(<NodeCardHeader kind="mesh" title="Mesh" />);
    expect(html).toContain(NODE_GLYPH.mesh);
    expect(html).toContain("Mesh");
    expect(html).toContain(withAlpha(cat, 0.22));
    expect(html).toContain(withAlpha(cat, 0.08));
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).toContain(`color:${cat}`);
  });

  it("renders the process category (Shader) with a meta slot", () => {
    const cat = tokens.nodeCategory.process;
    const html = renderInFlow(
      <NodeCardHeader
        kind="shader"
        title="Shader"
        meta={<span data-testid="fixture-meta">0.31ms</span>}
      />,
    );
    expect(html).toContain(NODE_GLYPH.shader);
    expect(html).toContain("Shader");
    expect(html).toContain(withAlpha(cat, 0.22));
    expect(html).toContain(withAlpha(cat, 0.08));
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).toContain('data-testid="fixture-meta"');
    expect(html).toContain("0.31ms");
  });

  it("renders the value category (Param) and omits the meta slot when absent", () => {
    const cat = tokens.nodeCategory.value;
    const html = renderInFlow(<NodeCardHeader kind="param" title="Param" />);
    expect(html).toContain(NODE_GLYPH.param);
    expect(html).toContain("Param");
    expect(html).toContain(withAlpha(cat, 0.22));
    expect(html).toContain(withAlpha(cat, 0.08));
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).not.toContain("fixture-meta");
  });

  it("renders the error tone gradient (0.26/0.1 semantic.error) instead of the category color", () => {
    const err = tokens.semantic.error;
    const cat = tokens.nodeCategory.process;
    const html = renderInFlow(
      <NodeCardHeader kind="shader" title="Shader" tone="error" />,
    );
    expect(html).toContain(withAlpha(err, 0.26));
    expect(html).toContain(withAlpha(err, 0.1));
    expect(html).not.toContain(withAlpha(cat, 0.22));
    // The icon box glyph stays the category color even in error tone — only
    // the header gradient communicates "this instance is broken".
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).toContain(`color:${cat}`);
  });
});

describe("NodeCardHeader — inline rename (D15)", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    useGraphStore.getState().reset();
  });

  it("without a nodeId, renders the static title div — no title button at all", () => {
    render(
      <ReactFlowProvider>
        <NodeCardHeader kind="mesh" title="Mesh" />
      </ReactFlowProvider>,
    );
    expect(screen.queryByTestId("node-title-text")).toBeNull();
    expect(screen.queryByTestId("node-title-input")).toBeNull();
    expect(screen.getByText("Mesh")).not.toBeNull();
  });

  it("enters edit mode (node-title-input appears) on two clicks within 350ms", () => {
    renderRenameable("n1", "Cube");
    expect(screen.queryByTestId("node-title-input")).toBeNull();
    doubleClickTitle();
    expect(screen.getByTestId("node-title-input")).not.toBeNull();
  });

  it("commits the typed value via Enter, updating the store's node name (undo-able rename)", () => {
    renderRenameable("n1", "Cube");
    doubleClickTitle();
    const input = screen.getByTestId("node-title-input");
    fireEvent.change(input, { target: { value: "Rim glow" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const node = useGraphStore.getState().nodes.find((n) => n.id === "n1");
    expect(node?.name).toBe("Rim glow");
    expect(screen.queryByTestId("node-title-input")).toBeNull();
  });

  it("commits on blur as well", () => {
    renderRenameable("n1", "Cube");
    doubleClickTitle();
    const input = screen.getByTestId("node-title-input");
    fireEvent.change(input, { target: { value: "Blurred name" } });
    fireEvent.blur(input);

    const node = useGraphStore.getState().nodes.find((n) => n.id === "n1");
    expect(node?.name).toBe("Blurred name");
  });

  it("Escape cancels without committing — the node's name stays unchanged", () => {
    renderRenameable("n1", "Cube");
    doubleClickTitle();
    const input = screen.getByTestId("node-title-input");
    fireEvent.change(input, { target: { value: "Should not stick" } });
    fireEvent.keyDown(input, { key: "Escape" });

    const node = useGraphStore.getState().nodes.find((n) => n.id === "n1");
    expect(node?.name).toBeUndefined();
    expect(screen.queryByTestId("node-title-input")).toBeNull();
  });

  it("committing an empty value removes the name property (falls back to the registry default)", () => {
    renderRenameable("n1", "Cube");
    doubleClickTitle();
    const input = screen.getByTestId("node-title-input");
    fireEvent.change(input, { target: { value: "Custom name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      useGraphStore.getState().nodes.find((n) => n.id === "n1")?.name,
    ).toBe("Custom name");

    doubleClickTitle();
    const secondInput = screen.getByTestId("node-title-input");
    fireEvent.change(secondInput, { target: { value: "   " } });
    fireEvent.keyDown(secondInput, { key: "Enter" });

    const node = useGraphStore.getState().nodes.find((n) => n.id === "n1");
    expect(node).not.toHaveProperty("name");
  });

  it("the edit box uses accent.default border/ring tokens, not raw hex", () => {
    renderRenameable("n1", "Cube");
    doubleClickTitle();
    const input = screen.getByTestId("node-title-input");
    expect(input.style.border).toContain("var(--accent-default)");
    expect(input.style.boxShadow).toBe(
      `0 0 0 2px ${withAlpha(tokens.accent.default, 0.22)}`,
    );
    expect(input.style.background).toBe("var(--surface-app)");
  });
});
