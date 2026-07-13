import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLayoutStore } from "../state/layoutStore";
import { DockPanelHeader } from "./DockPanelHeader";

const initial = useLayoutStore.getState();

beforeEach(() => {
  useLayoutStore.setState(initial, true);
});

afterEach(() => {
  cleanup();
});

describe("DockPanelHeader", () => {
  it("renders the label with the uppercase-styled class and the meta badge", () => {
    render(
      <DockPanelHeader
        panelId="nodeEditor"
        label="Node Editor"
        meta="5N · 4E"
      />,
    );
    const label = screen.getByText("Node Editor");
    expect(label.className).toBe("dock-header-label");
    expect(screen.getByText("5N · 4E").className).toBe("dock-header-meta");
  });

  it("renders a children slot (e.g. tabs) alongside the grab handle", () => {
    render(
      <DockPanelHeader panelId="sidePanel">
        <button type="button">Inspector</button>
      </DockPanelHeader>,
    );
    expect(screen.getByRole("button", { name: "Inspector" })).not.toBeNull();
  });

  it("toggles collapsed[panelId] and flips aria-expanded on Collapse click", () => {
    render(<DockPanelHeader panelId="viewport" label="Viewport" />);
    const collapseBtn = screen.getByRole("button", { name: "Collapse panel" });
    expect(collapseBtn.getAttribute("aria-expanded")).toBe("true");
    expect(useLayoutStore.getState().collapsed.viewport).toBe(false);

    fireEvent.click(collapseBtn);

    expect(useLayoutStore.getState().collapsed.viewport).toBe(true);
    const expandBtn = screen.getByRole("button", { name: "Expand panel" });
    expect(expandBtn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandBtn);
    expect(useLayoutStore.getState().collapsed.viewport).toBe(false);
  });

  it("sets maximized on Maximize click, and clears it back to null on a second click", () => {
    render(<DockPanelHeader panelId="codeEditor" label="Code Editor" />);
    const maximizeBtn = screen.getByRole("button", { name: "Maximize panel" });

    fireEvent.click(maximizeBtn);
    expect(useLayoutStore.getState().maximized).toBe("codeEditor");
    const restoreBtn = screen.getByRole("button", { name: "Restore panel" });

    fireEvent.click(restoreBtn);
    expect(useLayoutStore.getState().maximized).toBeNull();
  });

  // M1-U2: shell-left (Node Editor) is the one docked slot that collapses to
  // a 34px *width* strip instead of a 34px *height* strip. A collapsedRail
  // header must hide label/meta/maximize and drop to a vertical layout so
  // the restore button stays inside the strip instead of overflowing a
  // horizontal row and getting clipped by the panel's overflow:hidden.
  describe("collapsedRail", () => {
    it("renders the normal horizontal header while expanded, even with collapsedRail set", () => {
      render(
        <DockPanelHeader
          panelId="nodeEditor"
          label="Node Editor"
          meta="5N · 4E"
          collapsedRail
        />,
      );
      expect(screen.getByText("Node Editor")).not.toBeNull();
      expect(screen.getByText("5N · 4E")).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Maximize panel" }),
      ).not.toBeNull();
      const header = screen.getByRole("button", {
        name: "Collapse panel",
      }).parentElement;
      expect(header?.className).toBe("dock-header");
    });

    it("switches to a vertical rail — hiding label/meta/maximize — once collapsed, and the restore button un-collapses it", () => {
      render(
        <DockPanelHeader
          panelId="nodeEditor"
          label="Node Editor"
          meta="5N · 4E"
          collapsedRail
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      expect(useLayoutStore.getState().collapsed.nodeEditor).toBe(true);

      expect(screen.queryByText("Node Editor")).toBeNull();
      expect(screen.queryByText("5N · 4E")).toBeNull();
      expect(screen.queryByRole("button", { name: "Maximize panel" })).toBe(
        null,
      );
      const restoreBtn = screen.getByRole("button", { name: "Expand panel" });
      expect(restoreBtn.parentElement?.className).toBe(
        "dock-header dock-header--rail",
      );

      fireEvent.click(restoreBtn);
      expect(useLayoutStore.getState().collapsed.nodeEditor).toBe(false);
      expect(screen.getByText("Node Editor")).not.toBeNull();
    });
  });
});
