import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCommandPaletteStore } from "../state/commandPaletteStore";
import { GraphEmptyState } from "./GraphEmptyState";

beforeEach(() => {
  useCommandPaletteStore.getState().setOpen(false);
});

afterEach(() => {
  cleanup();
});

describe("GraphEmptyState", () => {
  it("renders the title and both buttons", () => {
    render(<GraphEmptyState onLoadPreset={() => {}} />);

    expect(screen.getByText("Your graph is empty")).not.toBeNull();
    expect(screen.getByTestId("graph-empty-add-node").textContent).toContain(
      "Add node",
    );
    expect(screen.getByTestId("graph-empty-load-preset").textContent).toContain(
      "Load a preset",
    );
  });

  it("clicking + Add node opens the command palette", () => {
    render(<GraphEmptyState onLoadPreset={() => {}} />);
    expect(useCommandPaletteStore.getState().open).toBe(false);

    fireEvent.click(screen.getByTestId("graph-empty-add-node"));

    expect(useCommandPaletteStore.getState().open).toBe(true);
  });

  it("clicking Load a preset calls onLoadPreset", () => {
    const onLoadPreset = vi.fn();
    render(<GraphEmptyState onLoadPreset={onLoadPreset} />);

    fireEvent.click(screen.getByTestId("graph-empty-load-preset"));

    expect(onLoadPreset).toHaveBeenCalledOnce();
  });
});
