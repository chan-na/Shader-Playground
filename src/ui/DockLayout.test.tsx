import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDockStore } from "../state/dockStore";
import { createDefaultDockTree, firstLeafPath } from "../state/dockTree";

// The 4 panel components DockLayout renders are heavy (WebGL canvas,
// CodeMirror, ReactFlow) and already covered by their own test suites —
// stub them so this file only exercises the tree→DOM layout logic.
vi.mock("./NodeEditor", () => ({
  NodeEditor: () => <div data-testid="stub-node-editor" />,
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
      useDockStore.getState().toggleCollapsed(["a", "a"]);
    });

    const shellLeft = q(container, "shell-left");
    expect(shellLeft.className).toContain("shell-slot--collapsed");
    expect((shellLeft as HTMLElement).style.flex).toBe("0 0 34px");
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("maximizing a leaf hides its non-ancestor siblings, gives it flex 1, and keeps every panel mounted", () => {
    const { container } = render(<DockLayout />);

    act(() => {
      useDockStore.getState().toggleMaximized("l2"); // viewport leaf
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
      let path = firstLeafPath(useDockStore.getState().tree);
      while (path !== null) {
        useDockStore.getState().closePanel(path);
        path = firstLeafPath(useDockStore.getState().tree);
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
});
