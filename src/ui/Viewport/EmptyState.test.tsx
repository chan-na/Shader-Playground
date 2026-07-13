import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRendererStore } from "../../state/rendererStore";
import { EmptyState } from "./EmptyState";

const initialRenderer = useRendererStore.getState();

afterEach(() => {
  useRendererStore.setState(initialRenderer, true);
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
});
