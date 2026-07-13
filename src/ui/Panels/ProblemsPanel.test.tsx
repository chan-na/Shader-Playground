import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emptyDiagnostics,
  useDiagnosticsStore,
} from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { useSelectionStore } from "../../state/selectionStore";
import { ProblemsPanel } from "./ProblemsPanel";

const initialDiagnostics = useDiagnosticsStore.getState();
const initialEditor = useEditorStore.getState();
const initialRenderer = useRendererStore.getState();

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

describe("ProblemsPanel", () => {
  it("renders a summary chip only for severities with a count > 0", () => {
    useDiagnosticsStore.getState().set("s1", {
      ...emptyDiagnostics(),
      vertex: [{ line: 3, severity: "error", message: "boom" }],
      fragment: [{ line: 4, severity: "warning", message: "unused" }],
    });

    render(<ProblemsPanel />);

    expect(screen.getByText("1 error")).not.toBeNull();
    expect(screen.getByText("1 warning")).not.toBeNull();
    expect(screen.queryByText(/info/)).toBeNull();
  });

  it("clicking a problem-row selects the node, maps link→fragment, and requests a jump", () => {
    useDiagnosticsStore.getState().set("s1", {
      ...emptyDiagnostics(),
      link: [{ line: 5, column: 3, severity: "error", message: "link fail" }],
    });

    render(<ProblemsPanel />);
    const row = screen.getByTestId("problem-row");
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("data-node-id")).toBe("s1");
    expect(row.getAttribute("data-stage")).toBe("link");

    fireEvent.click(row);

    expect(useSelectionStore.getState().selectedNodeId).toBe("s1");
    expect(useEditorStore.getState().activeStage).toBe("fragment");
    expect(useEditorStore.getState().jumpRequest).toMatchObject({
      nodeId: "s1",
      stage: "fragment",
      line: 5,
      column: 3,
    });
  });

  it("renders runtime errors as a non-clickable card (div, no problem-row testid)", () => {
    useRendererStore.setState((s) => ({
      stats: { ...s.stats, errors: ["GL context lost"] },
    }));

    render(<ProblemsPanel />);

    const message = screen.getByText("GL context lost");
    const card = message.closest(".problems-card");
    expect(card).not.toBeNull();
    expect(card?.tagName).toBe("DIV");
    expect(screen.queryByTestId("problem-row")).toBeNull();
  });

  it("uses the semantic severity var(--*) for each row's border-left color", () => {
    useDiagnosticsStore.getState().set("s1", {
      ...emptyDiagnostics(),
      fragment: [{ line: 1, severity: "warning", message: "careful" }],
    });
    useRendererStore.setState((s) => ({
      stats: { ...s.stats, errors: ["runtime boom"] },
    }));

    render(<ProblemsPanel />);

    const diagRow = screen.getByTestId("problem-row");
    expect(diagRow.getAttribute("style")).toContain(
      "border-left: 2px solid var(--warning)",
    );

    const runtimeCard = screen
      .getByText("runtime boom")
      .closest(".problems-card");
    expect(runtimeCard?.getAttribute("style")).toContain(
      "border-left: 2px solid var(--error)",
    );
  });

  it("shows the empty state when there are no diagnostics or runtime errors", () => {
    render(<ProblemsPanel />);
    expect(screen.getByText("No problems")).not.toBeNull();
    expect(screen.queryByTestId("problem-row")).toBeNull();
  });
});
