import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDockStore } from "../state/dockStore";
import { createDefaultDockTree, getNodeAt } from "../state/dockTree";
import { DockPanelHeader } from "./DockPanelHeader";
import { DockLeafContext, useDockLeaf } from "./dockLeafContext";

const initial = useDockStore.getState();

beforeEach(() => {
  useDockStore.setState(
    { ...initial, tree: createDefaultDockTree(), maximized: null },
    true,
  );
});

afterEach(() => {
  cleanup();
});

/** 기본 트리의 nodeEditor leaf(l1, path ["a","a"])로 감싼 정적 provider —
 * B2-U1: leaf 데이터(collapsed/active)는 컨텍스트가 아니라 dockStore에서
 * path로 직접 구독하므로, provider는 라우팅 정보(leafId/path)만 고정해도
 * 스토어 변경에 반응한다. */
function withLeaf(leafId: string, path: ("a" | "b")[], children: ReactNode) {
  return (
    <DockLeafContext.Provider value={{ leafId, path }}>
      {children}
    </DockLeafContext.Provider>
  );
}

describe("DockPanelHeader", () => {
  it("renders the label with the uppercase-styled class and the meta badge", () => {
    render(
      withLeaf(
        "l1",
        ["a", "a"],
        <DockPanelHeader label="Node Editor" meta="5N · 4E" />,
      ),
    );
    const label = screen.getByText("Node Editor");
    expect(label.className).toBe("dock-header-label");
    expect(screen.getByText("5N · 4E").className).toBe("dock-header-meta");
  });

  it("renders a children slot (e.g. tabs) alongside the grab handle", () => {
    render(
      withLeaf(
        "l3",
        ["a", "b", "b"],
        <DockPanelHeader>
          <button type="button">Inspector</button>
        </DockPanelHeader>,
      ),
    );
    expect(screen.getByRole("button", { name: "Inspector" })).not.toBeNull();
  });

  it("toggles the leaf's collapsed flag in dockStore and flips aria-expanded on Collapse click", () => {
    render(
      withLeaf("l2", ["a", "b", "a"], <DockPanelHeader label="Viewport" />),
    );
    const collapseBtn = screen.getByRole("button", { name: "Collapse panel" });
    expect(collapseBtn.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapseBtn);

    const treeAfter = useDockStore.getState().tree;
    if (treeAfter === null) throw new Error("unreachable");
    expect(getNodeAt(treeAfter, ["a", "b", "a"])).toMatchObject({
      collapsed: true,
    });
    const expandBtn = screen.getByRole("button", { name: "Expand panel" });
    expect(expandBtn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandBtn);
    const treeAfter2 = useDockStore.getState().tree;
    if (treeAfter2 === null) throw new Error("unreachable");
    expect(getNodeAt(treeAfter2, ["a", "b", "a"])).toMatchObject({
      collapsed: false,
    });
  });

  it("sets maximized to this leaf's id on Maximize click, and clears it back to null on a second click", () => {
    render(withLeaf("l4", ["b"], <DockPanelHeader label="Code Editor" />));
    const maximizeBtn = screen.getByRole("button", { name: "Maximize panel" });

    fireEvent.click(maximizeBtn);
    expect(useDockStore.getState().maximized).toBe("l4");
    const restoreBtn = screen.getByRole("button", { name: "Restore panel" });

    fireEvent.click(restoreBtn);
    expect(useDockStore.getState().maximized).toBeNull();
  });

  it("throws when rendered outside DockLeafContext.Provider", () => {
    function Bare() {
      useDockLeaf();
      return null;
    }
    // React logs an error boundary-less throw to console; suppress that
    // noise for this expected-failure assertion.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(
      "useDockLeaf must be used inside DockLeafContext.Provider",
    );
    spy.mockRestore();
  });

  // M1-U2: shell-left (Node Editor) is the one docked slot that collapses to
  // a 34px *width* strip instead of a 34px *height* strip. A collapsedRail
  // header must hide label/meta/maximize and drop to a vertical layout so
  // the restore button stays inside the strip instead of overflowing a
  // horizontal row and getting clipped by the panel's overflow:hidden.
  describe("collapsedRail", () => {
    it("renders the normal horizontal header while expanded, even with collapsedRail set", () => {
      render(
        withLeaf(
          "l1",
          ["a", "a"],
          <DockPanelHeader label="Node Editor" meta="5N · 4E" collapsedRail />,
        ),
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
        withLeaf(
          "l1",
          ["a", "a"],
          <DockPanelHeader label="Node Editor" meta="5N · 4E" collapsedRail />,
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["a", "a"])).toMatchObject({ collapsed: true });

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
      const treeAfter = useDockStore.getState().tree;
      if (treeAfter === null) throw new Error("unreachable");
      expect(getNodeAt(treeAfter, ["a", "a"])).toMatchObject({
        collapsed: false,
      });
      expect(screen.getByText("Node Editor")).not.toBeNull();
    });
  });

  // D13: 메타 배지 정렬. 기본은 spacer *앞*(좌측, 기존 패널 보존), "end"는
  // App Shell.dc.html L361-369의 Code Editor 정본 순서인 spacer *뒤*(우측).
  describe("metaAlign", () => {
    it("defaults to start — meta renders before the spacer", () => {
      const { container } = render(
        withLeaf(
          "l1",
          ["a", "a"],
          <DockPanelHeader label="Node Editor" meta="5N · 4E" />,
        ),
      );
      const metaEl = screen.getByText("5N · 4E");
      const spacerEl = container.querySelector(".dock-header-spacer");
      if (spacerEl === null) {
        throw new Error("expected .dock-header-spacer to be in the DOM");
      }
      // spacerEl following metaEl in the DOM means metaEl comes first.
      expect(
        metaEl.compareDocumentPosition(spacerEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('metaAlign="end" renders meta after the spacer, before the Maximize button, keeping the same class', () => {
      const { container } = render(
        withLeaf(
          "l4",
          ["b"],
          <DockPanelHeader meta="GLSL · ES 3.0" metaAlign="end" />,
        ),
      );
      const metaEl = screen.getByText("GLSL · ES 3.0");
      expect(metaEl.className).toBe("dock-header-meta");

      const spacerEl = container.querySelector(".dock-header-spacer");
      if (spacerEl === null) {
        throw new Error("expected .dock-header-spacer to be in the DOM");
      }
      // metaEl following spacerEl in the DOM means spacer comes first.
      expect(
        spacerEl.compareDocumentPosition(metaEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      const maximizeBtn = screen.getByRole("button", {
        name: "Maximize panel",
      });
      expect(
        metaEl.compareDocumentPosition(maximizeBtn) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('hides metaAlign="end" meta the same as start once collapsed in a rail', () => {
      render(
        withLeaf(
          "l1",
          ["a", "a"],
          <DockPanelHeader
            label="Node Editor"
            meta="5N · 4E"
            metaAlign="end"
            collapsedRail
          />,
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["a", "a"])).toMatchObject({ collapsed: true });

      expect(screen.queryByText("5N · 4E")).toBeNull();
    });
  });
});
