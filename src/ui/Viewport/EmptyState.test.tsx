import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { EmptyState } from "./EmptyState";

const initialDiagnostics = useDiagnosticsStore.getState();
const initialRenderer = useRendererStore.getState();

afterEach(() => {
  useDiagnosticsStore.setState(initialDiagnostics, true);
  useRendererStore.setState(initialRenderer, true);
  useGraphStore.getState().reset();
  cleanup();
});

describe("EmptyState", () => {
  it("renders the title, three onboarding hint rows, and numbered chips when there are no panes", () => {
    useRendererStore.setState({ panes: [] });
    render(<EmptyState />);

    const root = screen.getByTestId("viewport-empty");
    expect(root).toBeTruthy();
    expect(root.querySelector(".vp-empty-title")?.textContent).toBe(
      "No Output connected",
    );

    const hints = root.querySelectorAll(".vp-empty-hint");
    expect(hints.length).toBe(3);
    const chipTexts = Array.from(
      root.querySelectorAll(".vp-empty-hint-chip"),
    ).map((el) => el.textContent);
    expect(chipTexts).toEqual(["1", "2", "3"]);
  });

  it("includes the ⌘K onboarding hint text", () => {
    useRendererStore.setState({ panes: [] });
    render(<EmptyState />);
    expect(screen.getByText("⌘K")).toBeTruthy();
    expect(screen.getByText(/Add Output/)).toBeTruthy();
  });

  it("renders nothing when at least one pane is connected", () => {
    useRendererStore.setState({
      panes: [{ outputNodeId: "o1", sourceNodeId: "s1" }],
    });
    const { container } = render(<EmptyState />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when a shader node has an error-severity diagnostic (CompileErrorOverlay takes over)", () => {
    useRendererStore.setState({ panes: [] });
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
      fragment: [{ line: 1, severity: "error", message: "boom" }],
      link: [],
    });

    const { container } = render(<EmptyState />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("viewport-empty")).toBeNull();
  });
});
