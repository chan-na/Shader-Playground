import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShaderGraphNode } from "../core/graph/types";
import { useDiagnosticsStore } from "../state/diagnosticsStore";
import { useDockStore } from "../state/dockStore";
import {
  collectPanelIds,
  createDefaultDockTree,
  type DockPanelId,
  getNodeAt,
} from "../state/dockTree";
import { useGraphStore } from "../state/graphStore";
import { useSelectionStore } from "../state/selectionStore";
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

/** 기본 트리의 nodeEditor leaf(l3, path ["b","a"])로 감싼 정적 provider —
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
        "l2",
        ["b", "b", "b"],
        <DockPanelHeader>
          <button type="button">Inspector</button>
        </DockPanelHeader>,
      ),
    );
    expect(screen.getByRole("button", { name: "Inspector" })).not.toBeNull();
  });

  it("renders the meta badge", () => {
    render(withLeaf("l3", ["b", "a"], <DockPanelHeader meta="5N · 4E" />));
    expect(screen.getByText("5N · 4E").className).toBe("dock-header-meta");
  });

  it("toggles the leaf's collapsed flag in dockStore and flips aria-expanded on Collapse click", () => {
    render(withLeaf("l1", ["b", "b", "a"], <DockPanelHeader />));
    const collapseBtn = screen.getByRole("button", { name: "Collapse panel" });
    expect(collapseBtn.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapseBtn);

    const treeAfter = useDockStore.getState().tree;
    if (treeAfter === null) throw new Error("unreachable");
    expect(getNodeAt(treeAfter, ["b", "b", "a"])).toMatchObject({
      collapsed: true,
    });
    const expandBtn = screen.getByRole("button", { name: "Expand panel" });
    expect(expandBtn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandBtn);
    const treeAfter2 = useDockStore.getState().tree;
    if (treeAfter2 === null) throw new Error("unreachable");
    expect(getNodeAt(treeAfter2, ["b", "b", "a"])).toMatchObject({
      collapsed: false,
    });
  });

  it("sets maximized to this leaf's id on Maximize click, and clears it back to null on a second click", () => {
    render(withLeaf("l4", ["a"], <DockPanelHeader />));
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
    render(withLeaf("l4", ["a"], <DockPanelHeader />));
    const maximizeBtn = screen.getByRole("button", { name: "Maximize panel" });
    expect(maximizeBtn.textContent).toBe("⤢");

    fireEvent.click(maximizeBtn);
    const restoreBtn = screen.getByRole("button", { name: "Restore panel" });
    expect(restoreBtn.textContent).toBe("⤡");
  });

  // R6: the header ✕ closes the whole panel (every tab on the leaf), unlike
  // a per-tab ✕ (tab-level close is covered by the "dock tabs" describe below).
  describe("Close panel", () => {
    it("removes every tab of this leaf from the tree (l2 sidePanel: inspector + assets)", () => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Close panel" }));

      const ids = collectPanelIds(useDockStore.getState().tree);
      expect(ids).not.toContain("inspector");
      expect(ids).not.toContain("assets");
    });

    it("clears maximized back to null when the header ✕ closes the maximized leaf (l1)", () => {
      render(withLeaf("l1", ["b", "b", "a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
      expect(useDockStore.getState().maximized).toBe("l1");

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
    it("renders one dock tab per leaf.tabs entry, active tab underlined (l2: inspector + assets)", () => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));

      const inspectorTab = screen.getByTestId("tab-inspector");
      const assetsTab = screen.getByTestId("tab-assets");
      expect(inspectorTab).not.toBeNull();
      expect(assetsTab).not.toBeNull();
      // default tree: l2.active === "inspector"
      expect(inspectorTab.className).toContain("panel-tab--active");
      expect(assetsTab.className).not.toContain("panel-tab--active");
    });

    it("clicking a tab sets it active in dockStore", () => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));

      fireEvent.click(screen.getByTestId("tab-assets"));

      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["b", "b", "b"])).toMatchObject({
        active: "assets",
      });
    });

    // R6 core: closing an *inactive* tab's ✕ must not first activate it —
    // only that tab leaves the tree, and the leaf's active tab is untouched.
    it("closing an inactive tab's ✕ removes only that tab and leaves the active tab unchanged", () => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));

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
      expect(getNodeAt(tree, ["b", "b", "b"])).toMatchObject({
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
          {withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />)}
        </div>,
      );
      const closeAssets = within(screen.getByTestId("tab-assets")).getByRole(
        "button",
        { name: "Close Assets tab" },
      );

      fireEvent.pointerDown(closeAssets);

      expect(onPointerDown).not.toHaveBeenCalled();
    });

    // R10(design/CHANGELOG.md §v1.4) 이행 — 탭 ✕는 키보드로 도달 가능해야
    // 한다. 부모 탭의 onKeyDown이 Enter/Space를 preventDefault하면 버튼의
    // 네이티브 활성화(→ click)가 통째로 죽는다.
    it.each([
      ["Enter"],
      [" "],
    ])("keeps %s on the tab ✕ from reaching the tab handler (no preventDefault, no tab activation)", (key) => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));
      const closeAssets = within(screen.getByTestId("tab-assets")).getByRole(
        "button",
        { name: "Close Assets tab" },
      );

      const ev = createEvent.keyDown(closeAssets, { key });
      fireEvent(closeAssets, ev);

      expect(ev.defaultPrevented).toBe(false);
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["b", "b", "b"])).toMatchObject({
        active: "inspector",
      });
    });

    // 통짜 stopPropagation이면 Cmd+Z/D/A와 화살표 nudge가 window 리스너에
    // 닿지 못한다(React는 루트 컨테이너에서 네이티브 전파까지 끊는다) —
    // KeyboardShortcuts가 정확히 window keydown을 듣는다.
    it("lets non-activation keys keep bubbling past the tab ✕ to window", () => {
      const onWindowKey = vi.fn();
      window.addEventListener("keydown", onWindowKey);
      try {
        render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));
        const closeAssets = within(screen.getByTestId("tab-assets")).getByRole(
          "button",
          { name: "Close Assets tab" },
        );

        fireEvent.keyDown(closeAssets, { key: "z", metaKey: true });
        fireEvent.keyDown(closeAssets, { key: "ArrowRight" });
        expect(onWindowKey).toHaveBeenCalledTimes(2);

        // 알려진 부수효과: 활성화 키는 여기서 멈춘다 — 포커스된 ✕ 위 Space는
        // 재생 토글이 아니라 버튼을 누른다(#36 followup).
        fireEvent.keyDown(closeAssets, { key: " " });
        expect(onWindowKey).toHaveBeenCalledTimes(2);
      } finally {
        window.removeEventListener("keydown", onWindowKey);
      }
    });

    it("renders a per-tab count badge from the `badges` prop", () => {
      render(
        withLeaf(
          "l2",
          ["b", "b", "b"],
          <DockPanelHeader badges={{ assets: 2 }} />,
        ),
      );

      const badge = screen
        .getByTestId("tab-assets")
        .querySelector(".panel-tab-badge");
      expect(badge?.textContent).toBe("2");
    });

    it("gives each panel dot a token-backed background (nodeEditor → --accent-default)", () => {
      render(withLeaf("l3", ["b", "a"], <DockPanelHeader />));

      const dot = screen
        .getByTestId("tab-nodeEditor")
        .querySelector(".panel-tab-dot");
      expect(dot?.getAttribute("style")).toContain("--accent-default");
    });

    it("Enter on a tab activates it (keyboard equivalent of click)", () => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));

      fireEvent.keyDown(screen.getByTestId("tab-assets"), { key: "Enter" });

      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["b", "b", "b"])).toMatchObject({
        active: "assets",
      });
    });

    it("renders no dock tabs while collapsed into a rail", () => {
      render(withLeaf("l3", ["b", "a"], <DockPanelHeader />));
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

    it("does not mask the default l2 leaf (2 tabs: inspector + assets)", () => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));

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
  // *width* strip?). In the v2.0 default tree, l3 (nodeEditor, parent is the
  // inner row split) and l4 (code, parent is the row-direction root split)
  // both do; l1 (viewport, parent is the col-direction split) doesn't.
  describe("rail derivation from the tree", () => {
    it("renders the normal horizontal header while expanded (l3, rail-capable)", () => {
      render(withLeaf("l3", ["b", "a"], <DockPanelHeader meta="5N · 4E" />));
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

    it("switches to a vertical rail — hiding tabs/meta/maximize/close — once collapsed (l3), and the restore button un-collapses it", () => {
      render(withLeaf("l3", ["b", "a"], <DockPanelHeader meta="5N · 4E" />));

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["b", "a"])).toMatchObject({ collapsed: true });

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
      expect(getNodeAt(treeAfter, ["b", "a"])).toMatchObject({
        collapsed: false,
      });
      expect(screen.getByTestId("tab-nodeEditor")).not.toBeNull();
    });

    it("stays a horizontal header even once collapsed (l1 viewport, parent is the col-direction split — not rail-capable)", () => {
      render(withLeaf("l1", ["b", "b", "a"], <DockPanelHeader />));

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["b", "b", "a"])).toMatchObject({
        collapsed: true,
      });

      const expandBtn = screen.getByRole("button", { name: "Expand panel" });
      expect(expandBtn.parentElement?.className).toBe("dock-header");
      expect(screen.getByTestId("tab-viewport")).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Maximize panel" }),
      ).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Close panel" }),
      ).not.toBeNull();
    });
  });

  // X17: the collapsed 34px rail is no longer chrome-only (grip only) — it
  // now renders a full identity interior (panel dot + vertical "title · meta"
  // label + a code-only compile error dot), App Shell.dc.html L109-117.
  describe("rail interior (X17)", () => {
    // Z5(§v2.2): the code-rail error dot is scoped to the shader the Code
    // editor currently has open (selectedNodeId ?? first shader). These tests
    // wire a shader node so `openCodeNodeId` resolves to it.
    const shaderN1: ShaderGraphNode = {
      id: "n1",
      kind: "shader",
      vertexSource: "void main(){ gl_Position = vec4(0); }",
      fragmentSource: "void main(){}",
      uniformValues: {},
    };

    afterEach(() => {
      useDiagnosticsStore.getState().reset();
      useGraphStore.setState({ nodes: [] });
      useSelectionStore.setState({ selectedNodeId: null, selectedNodeIds: [] });
    });

    it("collapsed code rail renders the vertical title · meta label", () => {
      render(
        withLeaf(
          "l4",
          ["a"],
          <DockPanelHeader meta="GLSL · ES 3.0" metaAlign="end" />,
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      const label = screen.getByTestId("dock-rail-label");
      expect(label.textContent).toBe("Code · GLSL · ES 3.0");
      expect(label.className).toBe("dock-rail-label");
    });

    it("expanded header renders no rail interior", () => {
      render(
        withLeaf(
          "l4",
          ["a"],
          <DockPanelHeader meta="GLSL · ES 3.0" metaAlign="end" />,
        ),
      );

      expect(screen.queryByTestId("dock-rail-label")).toBeNull();
      expect(screen.queryByTestId("dock-rail-error-dot")).toBeNull();
    });

    it("meta-less rail label falls back to the title alone", () => {
      render(withLeaf("l3", ["b", "a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      expect(screen.getByTestId("dock-rail-label").textContent).toBe(
        "Node Editor",
      );
    });

    it("code rail shows the error dot when the open shader's diagnostics hold an error", () => {
      useGraphStore.setState({ nodes: [shaderN1] });
      useDiagnosticsStore.getState().set("n1", {
        vertex: [{ line: 1, severity: "error", message: "boom" }],
        fragment: [],
        link: [],
      });
      render(withLeaf("l4", ["a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      const dot = screen.getByTestId("dock-rail-error-dot");
      expect(dot).not.toBeNull();
      expect(dot.getAttribute("title")).toBe("1 compile error");
    });

    it("code rail shows no error dot for warning-only diagnostics", () => {
      useGraphStore.setState({ nodes: [shaderN1] });
      useDiagnosticsStore.getState().set("n1", {
        vertex: [{ line: 1, severity: "warning", message: "careful" }],
        fragment: [],
        link: [],
      });
      render(withLeaf("l4", ["a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      expect(screen.queryByTestId("dock-rail-error-dot")).toBeNull();
    });

    it("code rail error dot is scoped to the open shader — an error on another node is ignored (Z5)", () => {
      // n1 is the open shader (first shader → effectiveId). The error lives on
      // an unrelated node, so under node-scope the dot must stay dark.
      useGraphStore.setState({ nodes: [shaderN1] });
      useDiagnosticsStore.getState().set("other-node", {
        vertex: [{ line: 1, severity: "error", message: "elsewhere" }],
        fragment: [],
        link: [],
      });
      render(withLeaf("l4", ["a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      expect(screen.queryByTestId("dock-rail-error-dot")).toBeNull();
    });

    it("non-code rail never shows the error dot", () => {
      useDiagnosticsStore.getState().set("n1", {
        vertex: [{ line: 1, severity: "error", message: "boom" }],
        fragment: [],
        link: [],
      });
      render(withLeaf("l3", ["b", "a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      expect(screen.getByTestId("dock-rail-label")).not.toBeNull();
      expect(screen.queryByTestId("dock-rail-error-dot")).toBeNull();
    });

    it("rail keeps the expand chevron and mechanism-side chrome untouched", () => {
      render(withLeaf("l4", ["a"], <DockPanelHeader />));
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));

      const expandBtn = screen.getByRole("button", { name: "Expand panel" });
      expect(expandBtn).not.toBeNull();
      expect(expandBtn.parentElement?.className).toBe(
        "dock-header dock-header--rail",
      );
    });
  });

  // req1: the collapse button's glyph is position-based (parent split dir +
  // a/b side), not tied to panel kind — see `dockLayoutModel.collapseChevron`
  // for the full 8-combination unit coverage. This just asserts the rendered
  // button actually consumes that helper (no leftover literal `⌄`/`⌃`
  // branch) on a couple of v2.0 default-tree positions.
  describe("collapse chevron glyph is position-based (req1)", () => {
    it("row-a (l4 code, path [a]): ‹ while open, › once collapsed", () => {
      render(withLeaf("l4", ["a"], <DockPanelHeader />));
      const collapseBtn = screen.getByRole("button", {
        name: "Collapse panel",
      });
      expect(collapseBtn.textContent).toBe("‹");

      fireEvent.click(collapseBtn);
      const expandBtn = screen.getByRole("button", { name: "Expand panel" });
      expect(expandBtn.textContent).toBe("›");
    });

    it("col-b (l2 sidePanel, path [b,b,b]): ⌄ while open", () => {
      render(withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />));
      const collapseBtn = screen.getByRole("button", {
        name: "Collapse panel",
      });
      expect(collapseBtn.textContent).toBe("⌄");
    });
  });

  // D13: 메타 배지 정렬. 기본은 spacer *앞*(좌측, 기존 패널 보존), "end"는
  // App Shell.dc.html L361-369의 Code Editor 정본 순서인 spacer *뒤*(우측).
  describe("metaAlign", () => {
    it("defaults to start — meta renders before the spacer", () => {
      const { container } = render(
        withLeaf("l3", ["b", "a"], <DockPanelHeader meta="5N · 4E" />),
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
          ["a"],
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
          "l3",
          ["b", "a"],
          <DockPanelHeader meta="5N · 4E" metaAlign="end" />,
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      const tree = useDockStore.getState().tree;
      if (tree === null) throw new Error("unreachable");
      expect(getNodeAt(tree, ["b", "a"])).toMatchObject({ collapsed: true });

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
        withLeafAndDrag("l2", ["b", "b", "b"], <DockPanelHeader />, {
          startLeafDrag,
          startTabDrag,
          dragEnabled: true,
        }),
      );

      const grab = container.querySelector(".dock-header-grab");
      if (grab === null) throw new Error("expected .dock-header-grab");
      fireEvent.pointerDown(grab);

      expect(startLeafDrag).toHaveBeenCalledTimes(1);
      expect(startLeafDrag.mock.calls[0]?.[0]).toEqual(["b", "b", "b"]);
      expect(startTabDrag).not.toHaveBeenCalled();
    });

    it("a tab's pointerdown calls startTabDrag with that tab's id, not startLeafDrag", () => {
      const startLeafDrag = vi.fn();
      const startTabDrag = vi.fn();
      render(
        withLeafAndDrag("l2", ["b", "b", "b"], <DockPanelHeader />, {
          startLeafDrag,
          startTabDrag,
          dragEnabled: true,
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
        withLeafAndDrag("l2", ["b", "b", "b"], <DockPanelHeader />, {
          startLeafDrag,
          startTabDrag,
          dragEnabled: true,
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
        withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />),
      );

      const grab = container.querySelector(".dock-header-grab");
      if (grab === null) throw new Error("expected .dock-header-grab");
      expect(() => fireEvent.pointerDown(grab)).not.toThrow();
      expect(() =>
        fireEvent.pointerDown(screen.getByTestId("tab-assets")),
      ).not.toThrow();
    });

    // R11: a `dragEnabled:false` provider (DockLayout's compact branch) must
    // remove the ⣿ grab handle from the DOM entirely — not just visually
    // hide it — so a narrow-screen tap can't accidentally arm a drag. The
    // default context (no provider, exercised just above) keeps
    // `dragEnabled:true` so every pre-R11 test in this file — none of which
    // wrap a provider — kept seeing the handle without modification.
    it("R11: dragEnabled:false hides the ⣿ grab handle; the default context (no provider) still shows it", () => {
      const { container } = render(
        withLeafAndDrag("l2", ["b", "b", "b"], <DockPanelHeader />, {
          startLeafDrag: vi.fn(),
          startTabDrag: vi.fn(),
          dragEnabled: false,
        }),
      );
      expect(container.querySelector(".dock-header-grab")).toBeNull();

      cleanup();

      const { container: defaultContainer } = render(
        withLeaf("l2", ["b", "b", "b"], <DockPanelHeader />),
      );
      expect(
        defaultContainer.querySelector(".dock-header-grab"),
      ).not.toBeNull();
    });
  });
});
