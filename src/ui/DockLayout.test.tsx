import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDockStore } from "../state/dockStore";
import {
  collectPanelIds,
  createDefaultDockTree,
  DOCK_PANEL_IDS,
  type DockNode,
  type DockPath,
  findTabLeafPath,
} from "../state/dockTree";
import { useDockDragStart } from "./dockDragContext";

/** 테스트 전용 순회 헬퍼 — v2.0에서 프로덕션의 `firstLeafPath`(무조건 첫
 * leaf)는 병합 대상만 찾는 `firstMergeableLeafPath`(addPanel 전용, S5/T1)로
 * 대체됐다. 아래 "닫힐 때까지 반복" 루프는 병합 가능 여부와 무관하게 *아무*
 * leaf나 하나 골라 반복하면 충분하므로, 옛 동작을 그대로 복제한
 * 모듈-로컬 헬퍼를 둔다(프로덕션 export가 아니므로 knip 대상이 아니다). */
function anyLeafPath(node: DockNode | null): DockPath | null {
  if (node === null) return null;
  if (node.type === "leaf") return [];
  const sub = anyLeafPath(node.a);
  return sub === null ? null : ["a", ...sub];
}

// The 4 panel components DockLayout renders are heavy (WebGL canvas,
// CodeMirror, ReactFlow) and already covered by their own test suites —
// stub them so this file only exercises the tree→DOM layout logic. The
// NodeEditor stub additionally consumes `useDockDragStart` (B4-U3) to expose
// a `startTabDrag` trigger button — `dockDragContext` isn't the module being
// mocked here, so importing it directly inside this factory is fine (it
// isn't itself subject to `vi.mock` hoisting rules the way `./NodeEditor`
// is).
vi.mock("./NodeEditor", () => ({
  NodeEditor: () => {
    const drag = useDockDragStart();
    return (
      <div data-testid="stub-node-editor">
        <button
          type="button"
          data-testid="stub-drag-tab"
          onPointerDown={(e) => drag.startTabDrag("nodeEditor", e)}
        />
      </div>
    );
  },
}));
vi.mock("./Viewport", () => ({
  Viewport: () => <div data-testid="stub-viewport" />,
}));
vi.mock("./Panels/SidePanel", () => ({
  SidePanel: () => <div data-testid="stub-side-panel" />,
}));
vi.mock("./CodeEditor", () => ({
  CodeEditor: () => <div data-testid="stub-code-editor" />,
}));

import { DockLayout } from "./DockLayout";

const initial = useDockStore.getState();

beforeEach(() => {
  useDockStore.setState(
    {
      ...initial,
      tree: createDefaultDockTree(),
      maximized: null,
      nextLeafId: 5,
    },
    true,
  );
});

afterEach(() => {
  cleanup();
});

function q(container: HTMLElement, className: string): Element {
  const els = container.getElementsByClassName(className);
  expect(els.length).toBe(1);
  const el = els[0];
  if (el === undefined) throw new Error("unreachable — length checked above");
  return el;
}

describe("DockLayout", () => {
  it("renders the default tree as the 4 legacy leaf slots + 3 separators + all 4 stub panels", () => {
    const { container } = render(<DockLayout />);

    expect(container.getElementsByClassName("shell-left").length).toBe(1);
    expect(container.getElementsByClassName("shell-right-top").length).toBe(1);
    expect(container.getElementsByClassName("shell-right-bottom").length).toBe(
      1,
    );
    expect(container.getElementsByClassName("shell-code").length).toBe(1);
    expect(screen.getAllByRole("separator")).toHaveLength(3);

    expect(screen.getByTestId("stub-node-editor")).not.toBeNull();
    expect(screen.getByTestId("stub-viewport")).not.toBeNull();
    expect(screen.getByTestId("stub-side-panel")).not.toBeNull();
    expect(screen.getByTestId("stub-code-editor")).not.toBeNull();
  });

  it("R4: collapsing the nodeEditor leaf shrinks it to a 34px strip and removes its own divider (2 separators left)", () => {
    const { container } = render(<DockLayout />);

    act(() => {
      useDockStore.getState().toggleCollapsed(["b", "a"]);
    });

    const shellLeft = q(container, "shell-left");
    expect(shellLeft.className).toContain("shell-slot--collapsed");
    expect((shellLeft as HTMLElement).style.flex).toBe("0 0 34px");
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("maximizing a leaf hides its non-ancestor siblings, gives it flex 1, and keeps every panel mounted", () => {
    const { container } = render(<DockLayout />);

    act(() => {
      useDockStore.getState().toggleMaximized("l1"); // viewport leaf
    });

    const shellLeft = q(container, "shell-left");
    const shellRightBottom = q(container, "shell-right-bottom");
    const shellCode = q(container, "shell-code");
    const shellRightTop = q(container, "shell-right-top");

    expect(shellLeft.className).toContain("shell-slot--hidden");
    expect(shellRightBottom.className).toContain("shell-slot--hidden");
    expect(shellCode.className).toContain("shell-slot--hidden");
    expect(shellRightTop.className).not.toContain("shell-slot--hidden");
    // jsdom's CSSOM normalizes the shorthand "1" to its longhand-equivalent
    // serialization "1 1 0%" (flex-grow 1, flex-shrink 1, flex-basis 0%) —
    // the source-of-truth is still the single flex="1" string DockSplitView
    // sets (see the `head === "a" ? "1" : aFlex` branches).
    expect((shellRightTop as HTMLElement).style.flex).toBe("1 1 0%");

    // Unmount-guard invariant: even the hidden siblings' panel components
    // stay mounted (display:none via CSS only).
    expect(screen.getByTestId("stub-node-editor")).not.toBeNull();
    expect(screen.getByTestId("stub-viewport")).not.toBeNull();
    expect(screen.getByTestId("stub-side-panel")).not.toBeNull();
    expect(screen.getByTestId("stub-code-editor")).not.toBeNull();
  });

  it("B3-U4: renders the R1 empty state (no floating-panel wording) when the tree is null, with no panel stubs mounted", () => {
    useDockStore.setState({ tree: null });
    render(<DockLayout />);

    const empty = screen.getByTestId("dock-empty");
    expect(empty).not.toBeNull();
    // Exact R1 copy — v1.3's "drop a floating panel here" was superseded by
    // v1.4 R1 (floating removed entirely); a mismatch here is a regression
    // to the stale copy, not just a wording nit.
    expect(
      screen.getByText("No panels docked — add one with ＋ Panel"),
    ).not.toBeNull();

    expect(screen.queryByTestId("stub-node-editor")).toBeNull();
    expect(screen.queryByTestId("stub-viewport")).toBeNull();
    expect(screen.queryByTestId("stub-side-panel")).toBeNull();
    expect(screen.queryByTestId("stub-code-editor")).toBeNull();
  });

  it("B3-U4: closing every panel via the real closePanel path (root-first, repeated) reaches the empty state, and addPanel leaves it again", () => {
    const { rerender } = render(<DockLayout />);

    // Repeatedly close whatever leaf is currently first — this drives the
    // store through the same closePanel calls the dock header ✕ (R6) will
    // issue, rather than just setting tree:null directly, so it exercises
    // removePanel's tree-collapsing logic all the way to null.
    act(() => {
      let path = anyLeafPath(useDockStore.getState().tree);
      while (path !== null) {
        useDockStore.getState().closePanel(path);
        path = anyLeafPath(useDockStore.getState().tree);
      }
    });
    expect(useDockStore.getState().tree).toBeNull();
    rerender(<DockLayout />);
    expect(screen.getByTestId("dock-empty")).not.toBeNull();

    // Existing render path regression guard: bringing a panel back makes the
    // empty state disappear and the leaf render again.
    act(() => {
      useDockStore.getState().addPanel("viewport");
    });
    rerender(<DockLayout />);
    expect(screen.queryByTestId("dock-empty")).toBeNull();
    expect(screen.getByTestId("stub-viewport")).not.toBeNull();
  });

  it("S5: a heterogeneous leaf (nodeEditor+assets) renders by active kind, and switching active swaps the mounted panel + legacy class", () => {
    useDockStore.setState({
      tree: {
        type: "leaf",
        id: "mixed",
        tabs: ["nodeEditor", "assets"],
        active: "assets",
      },
      maximized: null,
    });
    const { container } = render(<DockLayout />);

    expect(container.getElementsByClassName("shell-right-bottom").length).toBe(
      1,
    );
    expect(container.getElementsByClassName("shell-left").length).toBe(0);
    expect(screen.getByTestId("stub-side-panel")).not.toBeNull();
    expect(screen.queryByTestId("stub-node-editor")).toBeNull();

    act(() => {
      useDockStore.getState().setActiveTab([], "nodeEditor");
    });

    expect(container.getElementsByClassName("shell-left").length).toBe(1);
    expect(container.getElementsByClassName("shell-right-bottom").length).toBe(
      0,
    );
    expect(screen.getByTestId("stub-node-editor")).not.toBeNull();
    expect(screen.queryByTestId("stub-side-panel")).toBeNull();
  });
});

// B4-U3: drag engine (pending → ghost transition, ghost tracking, drop
// preview, release). The stub `<button data-testid="stub-drag-tab">` inside
// the mocked NodeEditor calls `startTabDrag("nodeEditor", e)` on
// pointerdown — every scenario below drives a real pointerdown on that
// button, then dispatches pointermove/pointerup on `window` the same way
// `DockLayout`'s own listeners are attached (dc `onMove`/`onUp` parity).
describe("DockLayout drag engine (B4-U3)", () => {
  const RECT: DOMRect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1440,
    bottom: 826,
    width: 1440,
    height: 826,
    toJSON() {
      return this;
    },
  };

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      RECT,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Each step gets its own `act()` (rather than batching a whole scenario
  // into one) so React commits + flushes effects between steps — the
  // pointerdown's `setArmed(true)` has to actually run its effect (which
  // attaches the window pointermove/pointerup listeners) *before* the next
  // synthetic `pointermove` is dispatched, or that listener won't exist yet
  // and the move would silently be a no-op.
  // jsdom has no native `PointerEvent` constructor, so
  // `fireEvent.pointerDown(el, {clientX, clientY})` falls back to a plain
  // `Event` that silently drops clientX/clientY (they aren't part of the
  // base `EventInit` dict) — the handler would then read `undefined` and
  // `Math.hypot(NaN, NaN) < 4` is `false`, tripping the ghost transition on
  // *any* move regardless of distance. Dispatch a real `MouseEvent` instead
  // (same trick the spec calls for on pointermove) so clientX/clientY
  // actually land on the event React reads via its "pointerdown" listener.
  function down(clientX: number, clientY: number) {
    act(() => {
      fireEvent(
        screen.getByTestId("stub-drag-tab"),
        new MouseEvent("pointerdown", {
          clientX,
          clientY,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  }

  function move(clientX: number, clientY: number) {
    act(() => {
      fireEvent(window, new MouseEvent("pointermove", { clientX, clientY }));
    });
  }

  function up() {
    act(() => {
      fireEvent(window, new MouseEvent("pointerup", {}));
    });
  }

  it("1. a 3px move stays below the 4px threshold — no ghost, store untouched", () => {
    render(<DockLayout />);
    const before = useDockStore.getState().tree;

    down(100, 100);
    move(103, 100); // hypot(3,0) = 3 < 4

    expect(screen.queryByTestId("dock-drag-ghost")).toBeNull();
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("2. exceeding the 4px threshold detaches the tab and shows the ghost + dock-root--dragging", () => {
    const { container } = render(<DockLayout />);

    down(100, 100);
    move(103, 100); // still < 4, no-op
    move(105, 100); // hypot(5,0) = 5 >= 4 — crosses the threshold

    expect(screen.getByTestId("dock-drag-ghost")).not.toBeNull();
    // nodeEditor is no longer hosted by any leaf — it now lives only in the
    // transient ghost, not the tree (R1: floating is never a resting state,
    // but *while dragging* it is legitimately detached from the tree).
    expect(findTabLeafPath(useDockStore.getState().tree, "nodeEditor")).toBe(
      null,
    );
    expect(
      container.getElementsByClassName("dock-root--dragging"),
    ).toHaveLength(1);
  });

  it('3. moving into the left outer band (x=10) previews "Dock left"', () => {
    render(<DockLayout />);

    down(100, 100);
    move(105, 100); // cross the threshold, ghost appears
    move(10, 400); // x=10 < OUTER_DROP_BAND_PX(42) — left band

    expect(screen.getByText("Dock left")).not.toBeNull();
  });

  it("4. releasing over the left band docks outward-left (row split, ratio 0.28) and clears the ghost", () => {
    render(<DockLayout />);

    down(100, 100);
    move(105, 100);
    move(10, 400);
    up();

    const root = useDockStore.getState().tree;
    expect(root).toMatchObject({ type: "split", dir: "row", ratio: 0.28 });
    expect(screen.queryByTestId("dock-drag-ghost")).toBeNull();
    expect(screen.queryByText("Dock left")).toBeNull();
  });

  it("5. releasing in a gap outside every region/band still docks (R1) via fallbackDropTarget — no floating ghost survives", () => {
    render(<DockLayout />);

    // Once the nodeEditor tab (the sole tab of leaf l3) is detached, the
    // inner row split collapses and its sibling col split (viewport /
    // inspector+assets) takes over the rest of the width (x365↔1440) —
    // opening up a 426↔432 divider gap in that span (the left code column,
    // x0↔359, is unaffected). x=700,y=429 falls inside that gap: outside
    // every region's bounds and outside every 42px outer band, so
    // computeDropTarget returns null and onUp must fall back to the first
    // region (in-order, the code leaf) instead of leaving the ghost resting.
    down(200, 100);
    move(206, 100); // cross the threshold
    move(700, 429); // gap: not in any region, not in any outer band
    up();

    expect(screen.queryByTestId("dock-drag-ghost")).toBeNull();
    const tree = useDockStore.getState().tree;
    const nodeEditorPath = findTabLeafPath(tree, "nodeEditor");
    const codePath = findTabLeafPath(tree, "code");
    expect(nodeEditorPath).not.toBeNull();
    expect(codePath).not.toBeNull();
    // T1 (v2.0): the fallback target's leaf is the code leaf (exclusive) —
    // nodeEditor can't merge into it (canMergeDockTabs), so
    // insertDetachedLeaf splits instead of merging. The two panels end up
    // as split siblings, not sharing a single leaf — but neither is lost.
    expect(nodeEditorPath).not.toEqual(codePath);
    // the two are split siblings under the same parent path (T1's
    // right-split fallback geometry) — no panel lost.
    expect(nodeEditorPath?.slice(0, -1)).toEqual(codePath?.slice(0, -1));
    expect(collectPanelIds(tree)).toHaveLength(DOCK_PANEL_IDS.length);
    for (const id of DOCK_PANEL_IDS) {
      expect(collectPanelIds(tree)).toContain(id);
    }
  });
});

// R11: compact(≤990px, C-6 임계 재사용) 도킹 비활성 — 고정 세로 스택 폴백.
// jsdom은 `window.matchMedia`를 아예 구현하지 않는다(위 모든 테스트가 이미
// 그 경로를 탄다 — `typeof window.matchMedia !== "function"` → snapshot
// false, 즉 compact=false 취급). 여기서만 페이크 MediaQueryList를 심어
// compact=true 경로를 구동한다.
describe("DockLayout compact shell (R11)", () => {
  interface FakeMediaQueryList {
    matches: boolean;
    addEventListener: (type: "change", listener: () => void) => void;
    removeEventListener: (type: "change", listener: () => void) => void;
  }

  let listeners: Set<() => void>;
  let fakeMql: FakeMediaQueryList;

  /** `window.matchMedia`를 최소 페이크로 교체한다 — 실제 `MediaQueryList`
   * 전체 인터페이스(onchange/media/addListener 등 폐기 API 포함)를 구현할
   * 필요 없이, DockLayout.tsx의 `subscribeCompactShell`/
   * `getCompactShellSnapshot`이 실제로 쓰는 부분집합(matches +
   * addEventListener("change", …)/removeEventListener)만 만족시킨다 — 이
   * 캐스팅은 프로덕션 코드가 아니라 브라우저 API를 부분 구현하는 테스트
   * 더블이다(같은 관례: AppToolbar.test.tsx의 URL.createObjectURL 스텁,
   * WebcamNodeView.test.tsx의 MediaStream 스텁 등). */
  function installMatchMediaStub(initialMatches: boolean): void {
    listeners = new Set();
    fakeMql = {
      matches: initialMatches,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    (
      window as unknown as {
        matchMedia: (query: string) => FakeMediaQueryList;
      }
    ).matchMedia = vi.fn(() => fakeMql);
  }

  /** 스텁 MQL의 `matches`를 바꾸고 등록된 모든 리스너에 `change`를
   * 발화한다 — 실제 브라우저가 뷰포트 리사이즈로 미디어쿼리 매치 상태가
   * 바뀔 때 하는 일과 동일. */
  function fireMatchMediaChange(nextMatches: boolean): void {
    fakeMql.matches = nextMatches;
    act(() => {
      for (const listener of listeners) listener();
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("1. compact=false(wide): no dock-root--compact class, splitters present", () => {
    installMatchMediaStub(false);
    const { container } = render(<DockLayout />);

    expect(container.getElementsByClassName("dock-root--compact").length).toBe(
      0,
    );
    expect(screen.getAllByRole("separator")).toHaveLength(3);
  });

  it("2. compact=true: dock-root--compact class, 0 splitters, every .dock-leaf inline flex is '0 0 auto'", () => {
    installMatchMediaStub(true);
    const { container } = render(<DockLayout />);

    expect(container.getElementsByClassName("dock-root--compact").length).toBe(
      1,
    );
    expect(screen.queryAllByRole("separator")).toHaveLength(0);

    const leaves = container.getElementsByClassName("dock-leaf");
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of Array.from(leaves)) {
      expect((leaf as HTMLElement).style.flex).toBe("0 0 auto");
    }
  });

  it("3. compact=true: no ⣿ grab handle in the DOM, and a tab pointerdown→pointermove(>4px) creates no drag ghost", () => {
    installMatchMediaStub(true);
    const { container } = render(<DockLayout />);

    expect(container.querySelector(".dock-header-grab")).toBeNull();

    act(() => {
      fireEvent(
        screen.getByTestId("stub-drag-tab"),
        new MouseEvent("pointerdown", {
          clientX: 100,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    act(() => {
      fireEvent(
        window,
        new MouseEvent("pointermove", { clientX: 110, clientY: 100 }),
      );
    });

    expect(screen.queryByTestId("dock-drag-ghost")).toBeNull();
  });

  it("4. a matchMedia change event flips compact↔wide: splitters return and dockStore.tree keeps the same reference (tree preserved)", () => {
    installMatchMediaStub(true);
    const { container } = render(<DockLayout />);
    const treeBefore = useDockStore.getState().tree;

    expect(container.getElementsByClassName("dock-root--compact").length).toBe(
      1,
    );
    expect(screen.queryAllByRole("separator")).toHaveLength(0);

    fireMatchMediaChange(false);

    expect(container.getElementsByClassName("dock-root--compact").length).toBe(
      0,
    );
    expect(screen.getAllByRole("separator")).toHaveLength(3);
    expect(useDockStore.getState().tree).toBe(treeBefore);

    fireMatchMediaChange(true);

    expect(container.getElementsByClassName("dock-root--compact").length).toBe(
      1,
    );
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
    expect(useDockStore.getState().tree).toBe(treeBefore);
  });

  it("5. maximized state still hides sibling shell-slot--hidden leaves when rendered compact", () => {
    installMatchMediaStub(true);
    const { container } = render(<DockLayout />);

    act(() => {
      useDockStore.getState().toggleMaximized("l1"); // viewport leaf
    });

    const shellLeft = q(container, "shell-left");
    const shellRightBottom = q(container, "shell-right-bottom");
    const shellCode = q(container, "shell-code");
    const shellRightTop = q(container, "shell-right-top");

    expect(shellLeft.className).toContain("shell-slot--hidden");
    expect(shellRightBottom.className).toContain("shell-slot--hidden");
    expect(shellCode.className).toContain("shell-slot--hidden");
    expect(shellRightTop.className).not.toContain("shell-slot--hidden");
  });
});
