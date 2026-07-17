import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDockStore } from "../state/dockStore";
import {
  collectPanelIds,
  createDefaultDockTree,
  type DockPanelId,
  getNodeAt,
} from "../state/dockTree";
import { DockPanelHeader } from "./DockPanelHeader";
import { DockDragContext, type DockDragStart } from "./dockDragContext";
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

/** Same as `withLeaf`, plus a `DockDragContext.Provider` wrapping it — B4-U4:
 * lets a test hand in spy `startLeafDrag`/`startTabDrag` to assert what the
 * grab handle/tab pointerdown wiring calls. Tests that don't need this
 * (the vast majority above) render with bare `withLeaf` and get the
 * context's default no-op — that's exactly the "renders fine without a
 * provider" case asserted below. */
function withLeafAndDrag(
  leafId: string,
  path: ("a" | "b")[],
  children: ReactNode,
  drag: DockDragStart,
) {
  return (
    <DockDragContext.Provider value={drag}>
      {withLeaf(leafId, path, children)}
    </DockDragContext.Provider>
  );
}

describe("DockPanelHeader", () => {
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

  it("renders the meta badge", () => {
    render(withLeaf("l1", ["a", "a"], <DockPanelHeader meta="5N · 4E" />));
    expect(screen.getByText("5N · 4E").className).toBe("dock-header-meta");
  });

  it("toggles the leaf's collapsed flag in dockStore and flips aria-expanded on Collapse click", () => {
    render(withLeaf("l2", ["a", "b", "a"], <DockPanelHeader />));
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
    render(withLeaf("l4", ["b"], <DockPanelHeader />));
    const maximizeBtn = screen.getByRole("button", { name: "Maximize panel" });

    fireEvent.click(maximizeBtn);
    expect(useDockStore.getState().maximized).toBe("l4");
    const restoreBtn = screen.getByRole("button", { name: "Restore panel" });

    fireEvent.click(restoreBtn);
    expect(useDockStore.getState().maximized).toBeNull();
  });

  // dc `maxIcon: full ? "⤡" : "⤢"` (Docking Prototype.dc.html L562)
  // — the glyph itself toggles with maximized state, not just the aria-label.
  it("shows ⤢ (U+2922) when idle and flips to ⤡ (U+2921) once maximized", () => {
    render(withLeaf("l4", ["b"], <DockPanelHeader />));
    const maximizeBtn = screen.getByRole("button", { name: "Maximize panel" });
    expect(maximizeBtn.textContent).toBe("⤢");

    fireEvent.click(maximizeBtn);
    const restoreBtn = screen.getByRole("button", { name: "Restore panel" });
    expect(restoreBtn.textContent).toBe("⤡");
  });

  // R6: the header ✕ closes the whole panel (every tab on the leaf), unlike
  // a per-tab ✕ (tab-level close is covered by the "dock tabs" describe below).
  describe("Close panel", () => {
    it("removes every tab of this leaf from the tree (l3 sidePanel: inspector + assets)", () => {
      render(withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Close panel" }));

      const ids = collectPanelIds(useDockStore.getState().tree);
      expect(ids).not.toContain("inspector");
      expect(ids).not.toContain("assets");
    });

    it("clears maximized back to null when the header ✕ closes the maximized leaf (l2)", () => {
      render(withLeaf("l2", ["a", "b", "a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
      expect(useDockStore.getState().maximized).toBe("l2");

      fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
      expect(useDockStore.getState().maximized).toBeNull();
      expect(collectPanelIds(useDockStore.getState().tree)).not.toContain(
        "viewport",
      );
    });
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

  // B3-U2/R6: DockPanelHeader now renders `leaf.tabs` directly as dock tabs
  // (dot + title + per-tab ✕) instead of taking a `label` prop — the label
  // prop is retired because the tab(s) occupy that slot instead.
  describe("dock tabs (leaf.tabs → panel-tab, R6/R12)", () => {
    it("renders one dock tab per leaf.tabs entry, active tab underlined (l3: inspector + assets)", () => {
      render(withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />));

      const inspectorTab = screen.getByTestId("tab-inspector");
      const assetsTab = screen.getByTestId("tab-assets");
      expect(inspectorTab).not.toBeNull();
      expect(assetsTab).not.toBeNull();
      // default tree: l3.active === "inspector"
      expect(inspectorTab.className).toContain("panel-tab--active");
      expect(assetsTab.className).not.toContain("panel-tab--active");
    });

    it("clicking a tab sets it active in dockStore", () => {
      render(withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />));

      fireEvent.click(screen.getByTestId("tab-assets"));

      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["a", "b", "b"])).toMatchObject({
        active: "assets",
      });
    });

    // R6 core: closing an *inactive* tab's ✕ must not first activate it —
    // only that tab leaves the tree, and the leaf's active tab is untouched.
    it("closing an inactive tab's ✕ removes only that tab and leaves the active tab unchanged", () => {
      render(withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />));

      const closeAssets = within(screen.getByTestId("tab-assets")).getByRole(
        "button",
        { name: "Close Assets tab" },
      );
      fireEvent.click(closeAssets);

      const tree = useDockStore.getState().tree;
      const ids = collectPanelIds(tree);
      expect(ids).toContain("inspector");
      expect(ids).not.toContain("assets");
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["a", "b", "b"])).toMatchObject({
        active: "inspector",
      });
    });

    // dc `t.xDown: (e) => e.stopPropagation()` (Docking Prototype.dc.html
    // L546) — guards the ✕ from a future B4 drag-start listener on an
    // ancestor that also handles pointerdown.
    it("stops the tab ✕'s pointerdown from bubbling to an ancestor", () => {
      const onPointerDown = vi.fn();
      render(
        <div onPointerDown={onPointerDown}>
          {withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />)}
        </div>,
      );
      const closeAssets = within(screen.getByTestId("tab-assets")).getByRole(
        "button",
        { name: "Close Assets tab" },
      );

      fireEvent.pointerDown(closeAssets);

      expect(onPointerDown).not.toHaveBeenCalled();
    });

    it("renders a per-tab count badge from the `badges` prop", () => {
      render(
        withLeaf(
          "l3",
          ["a", "b", "b"],
          <DockPanelHeader badges={{ assets: 2 }} />,
        ),
      );

      const badge = screen
        .getByTestId("tab-assets")
        .querySelector(".panel-tab-badge");
      expect(badge?.textContent).toBe("2");
    });

    it("gives each panel dot a token-backed background (nodeEditor → --accent-default)", () => {
      render(withLeaf("l1", ["a", "a"], <DockPanelHeader />));

      const dot = screen
        .getByTestId("tab-nodeEditor")
        .querySelector(".panel-tab-dot");
      expect(dot?.getAttribute("style")).toContain("--accent-default");
    });

    it("Enter on a tab activates it (keyboard equivalent of click)", () => {
      render(withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />));

      fireEvent.keyDown(screen.getByTestId("tab-assets"), { key: "Enter" });

      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["a", "b", "b"])).toMatchObject({
        active: "assets",
      });
    });

    it("renders no dock tabs while collapsed into a rail", () => {
      render(withLeaf("l1", ["a", "a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      expect(screen.queryByTestId("tab-nodeEditor")).toBeNull();
    });
  });

  // R8/B3-U3: 탭바 가로 스크롤(스크롤바 숨김) + 우측 페이드 마스크는
  // leaf.tabs.length > 3에서만 켜진다 — dc `tabMask` (Docking
  // Prototype.dc.html L557) 이식. 기본 트리에는 4탭 leaf가 없으므로 여기서는
  // 트리를 직접 조작해 루트를 4탭 leaf로 바꿔치기한다(path=[] → 루트 그
  // 자체가 대상 leaf).
  describe("tab overflow mask (leaf.tabs.length > 3, R8)", () => {
    function setRootLeaf(tabs: DockPanelId[], active: DockPanelId) {
      useDockStore.setState(
        {
          ...useDockStore.getState(),
          tree: { type: "leaf", id: "lx", tabs, active },
          maximized: null,
        },
        true,
      );
    }

    it("adds dock-header-tabs--masked once a leaf has 4 tabs", () => {
      setRootLeaf(
        ["nodeEditor", "viewport", "inspector", "assets"],
        "nodeEditor",
      );
      const { container } = render(withLeaf("lx", [], <DockPanelHeader />));

      const tabsEl = container.querySelector(".dock-header-tabs");
      expect(tabsEl?.className).toContain("dock-header-tabs--masked");
      // dc L557 hint-placeholder-count=4 — all 4 tabs still render as tabs,
      // just inside the scrollable/masked container.
      expect(container.querySelectorAll('[role="tab"]')).toHaveLength(4);
    });

    it("does not mask the default l3 leaf (2 tabs: inspector + assets)", () => {
      render(withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />));

      const inspectorTab = screen.getByTestId("tab-inspector");
      const tabsEl = inspectorTab.parentElement;
      expect(tabsEl?.className).toBe("dock-header-tabs");
    });

    it("does not mask a 3-tab leaf — the threshold is strictly > 3", () => {
      setRootLeaf(["nodeEditor", "viewport", "inspector"], "nodeEditor");
      const { container } = render(withLeaf("lx", [], <DockPanelHeader />));

      const tabsEl = container.querySelector(".dock-header-tabs");
      expect(tabsEl?.className).toBe("dock-header-tabs");
    });
  });

  // B3-U1: whether a collapsed leaf renders as a vertical rail is no longer a
  // prop — it's derived from the tree (collapsesToRail: does this leaf's
  // direct parent split run row-direction, i.e. does it collapse to a
  // *width* strip?). l1 (nodeEditor, parent row split) does; l4 (code,
  // parent is the col-direction root split) doesn't.
  describe("rail derivation from the tree", () => {
    it("renders the normal horizontal header while expanded (l1, rail-capable)", () => {
      render(withLeaf("l1", ["a", "a"], <DockPanelHeader meta="5N · 4E" />));
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

    it("switches to a vertical rail — hiding tabs/meta/maximize/close — once collapsed (l1), and the restore button un-collapses it", () => {
      render(withLeaf("l1", ["a", "a"], <DockPanelHeader meta="5N · 4E" />));

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["a", "a"])).toMatchObject({ collapsed: true });

      expect(screen.queryByTestId("tab-nodeEditor")).toBeNull();
      expect(screen.queryByText("5N · 4E")).toBeNull();
      expect(screen.queryByRole("button", { name: "Maximize panel" })).toBe(
        null,
      );
      expect(screen.queryByRole("button", { name: "Close panel" })).toBe(null);
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
      expect(screen.getByTestId("tab-nodeEditor")).not.toBeNull();
    });

    it("stays a horizontal header even once collapsed (l4, parent is the col-direction root — not rail-capable)", () => {
      render(withLeaf("l4", ["b"], <DockPanelHeader />));

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["b"])).toMatchObject({ collapsed: true });

      const expandBtn = screen.getByRole("button", { name: "Expand panel" });
      expect(expandBtn.parentElement?.className).toBe("dock-header");
      expect(screen.getByTestId("tab-code")).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Maximize panel" }),
      ).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Close panel" }),
      ).not.toBeNull();
    });
  });

  // D13: 메타 배지 정렬. 기본은 spacer *앞*(좌측, 기존 패널 보존), "end"는
  // App Shell.dc.html L361-369의 Code Editor 정본 순서인 spacer *뒤*(우측).
  describe("metaAlign", () => {
    it("defaults to start — meta renders before the spacer", () => {
      const { container } = render(
        withLeaf("l1", ["a", "a"], <DockPanelHeader meta="5N · 4E" />),
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
          <DockPanelHeader meta="5N · 4E" metaAlign="end" />,
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["a", "a"])).toMatchObject({ collapsed: true });

      expect(screen.queryByText("5N · 4E")).toBeNull();
    });
  });

  // B4-U4: the grab handle drags the whole leaf (every tab); a tab drags
  // only itself. dc `grabDown`/`down` (Docking Prototype.dc.html L558/L544).
  describe("drag start wiring (B4-U4)", () => {
    it("⣿ grab pointerdown calls startLeafDrag with this leaf's path, not startTabDrag", () => {
      const startLeafDrag = vi.fn();
      const startTabDrag = vi.fn();
      const { container } = render(
        withLeafAndDrag("l3", ["a", "b", "b"], <DockPanelHeader />, {
          startLeafDrag,
          startTabDrag,
        }),
      );

      const grab = container.querySelector(".dock-header-grab");
      if (grab === null) throw new Error("expected .dock-header-grab");
      fireEvent.pointerDown(grab);

      expect(startLeafDrag).toHaveBeenCalledTimes(1);
      expect(startLeafDrag.mock.calls[0]?.[0]).toEqual(["a", "b", "b"]);
      expect(startTabDrag).not.toHaveBeenCalled();
    });

    it("a tab's pointerdown calls startTabDrag with that tab's id, not startLeafDrag", () => {
      const startLeafDrag = vi.fn();
      const startTabDrag = vi.fn();
      render(
        withLeafAndDrag("l3", ["a", "b", "b"], <DockPanelHeader />, {
          startLeafDrag,
          startTabDrag,
        }),
      );

      fireEvent.pointerDown(screen.getByTestId("tab-assets"));

      expect(startTabDrag).toHaveBeenCalledTimes(1);
      expect(startTabDrag.mock.calls[0]?.[0]).toBe("assets");
      expect(startLeafDrag).not.toHaveBeenCalled();
    });

    // dc t.xDown: e.stopPropagation() (L546) — the ✕'s own pointerdown
    // handler stops the event before it bubbles to the tab's onPointerDown,
    // so closing a tab never arms a drag.
    it("the tab ✕'s pointerdown does not call startTabDrag (stopPropagation)", () => {
      const startLeafDrag = vi.fn();
      const startTabDrag = vi.fn();
      render(
        withLeafAndDrag("l3", ["a", "b", "b"], <DockPanelHeader />, {
          startLeafDrag,
          startTabDrag,
        }),
      );

      const closeAssets = within(screen.getByTestId("tab-assets")).getByRole(
        "button",
        { name: "Close Assets tab" },
      );
      fireEvent.pointerDown(closeAssets);

      expect(startTabDrag).not.toHaveBeenCalled();
      expect(startLeafDrag).not.toHaveBeenCalled();
    });

    // No `DockDragContext.Provider` in scope (the default export's no-op) —
    // every other test in this file renders exactly this way, so this just
    // asserts the pointerdown wiring doesn't throw/crash without one.
    it("renders and handles pointerdown fine without a DockDragContext.Provider (default no-op)", () => {
      const { container } = render(
        withLeaf("l3", ["a", "b", "b"], <DockPanelHeader />),
      );

      const grab = container.querySelector(".dock-header-grab");
      if (grab === null) throw new Error("expected .dock-header-grab");
      expect(() => fireEvent.pointerDown(grab)).not.toThrow();
      expect(() =>
        fireEvent.pointerDown(screen.getByTestId("tab-assets")),
      ).not.toThrow();
    });
  });
});
