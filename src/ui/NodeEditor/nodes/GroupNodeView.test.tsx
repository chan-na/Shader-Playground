import { cleanup, render, screen } from "@testing-library/react";
import { type NodeProps, ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GroupGraphNode, MeshGraphNode } from "../../../core/graph/types";
import { useGraphStore } from "../../../state/graphStore";
import { tokens, withAlpha } from "../../../theme";
import { GroupNodeView } from "./GroupNodeView";

/** `selected: false` so NodeResizer's `isVisible` short-circuits to `null`
 * without needing a real React Flow node-store context — mirrors how
 * nodeViews.test.tsx's mockProps only fills in what the view actually reads.
 * Uses @testing-library/react's `render` (not nodeViews.test.tsx's
 * renderToStaticMarkup) because this view's collapsed child-count comes from
 * a live `useGraphStore` selector, and zustand v5's `useSyncExternalStore`
 * only reflects store updates to a real, mounted subscriber — SSR/static
 * markup always sees the store's snapshot at *import* time (see
 * nodeViews.test.tsx's top-of-file note on the same limitation). */
function mockProps(id: string, node: GroupGraphNode): NodeProps {
  return { id, data: { node }, selected: false } as unknown as NodeProps;
}

function renderInFlow(id: string, node: GroupGraphNode) {
  return render(
    <ReactFlowProvider>
      <GroupNodeView {...mockProps(id, node)} />
    </ReactFlowProvider>,
  );
}

const mkChild = (id: string): MeshGraphNode => ({
  id,
  kind: "mesh",
  primitive: "cube",
  assetId: null,
});

describe("GroupNodeView", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    useGraphStore.getState().reset();
  });

  it("renders the label and an expanded (aria-expanded=true) collapse toggle by default", () => {
    const node: GroupGraphNode = {
      id: "g1",
      kind: "group",
      label: "Rim params",
      width: 190,
      height: 210,
    };
    renderInFlow("g1", node);
    expect(screen.getByText("Rim params")).not.toBeNull();
    const toggle = screen.getByTestId("group-collapse-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("▾");
  });

  it("shows a collapsed (aria-expanded=false) toggle and hides the child count when there are no children", () => {
    const node: GroupGraphNode = {
      id: "g1",
      kind: "group",
      label: "Rim params",
      width: 190,
      height: 210,
      collapsed: true,
    };
    renderInFlow("g1", node);
    const toggle = screen.getByTestId("group-collapse-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("▸");
    // 0 direct children ⇒ no count span next to the label.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows the direct child count next to the label once collapsed with children present", () => {
    useGraphStore.getState().addNode(mkChild("c1"), { x: 0, y: 0 });
    useGraphStore.getState().addNode(mkChild("c2"), { x: 0, y: 0 });
    useGraphStore.getState().setParent("c1", "g1");
    useGraphStore.getState().setParent("c2", "g1");

    const node: GroupGraphNode = {
      id: "g1",
      kind: "group",
      label: "Rim params",
      width: 190,
      height: 210,
      collapsed: true,
    };
    renderInFlow("g1", node);
    expect(screen.getByText("2")).not.toBeNull();
  });

  it("omits the child count even with children present when expanded", () => {
    useGraphStore.getState().addNode(mkChild("c1"), { x: 0, y: 0 });
    useGraphStore.getState().setParent("c1", "g1");

    const node: GroupGraphNode = {
      id: "g1",
      kind: "group",
      label: "Rim params",
      width: 190,
      height: 210,
      collapsed: false,
    };
    renderInFlow("g1", node);
    expect(screen.queryByText("1")).toBeNull();
  });

  it("uses the default container tint for the dashed frame border when no custom color is set", () => {
    const node: GroupGraphNode = {
      id: "g1",
      kind: "group",
      label: "Rim params",
      width: 190,
      height: 210,
    };
    renderInFlow("g1", node);
    const tint = tokens.nodeCategory.container;
    const frame = screen.getByTestId("group-node");
    expect(frame.style.border).toBe(`1.5px dashed ${withAlpha(tint, 0.55)}`);
    expect(frame.style.background).toBe(withAlpha(tint, 0.05));
  });

  it("uses a custom node.color as the tint for the frame border and header swatch", () => {
    const node: GroupGraphNode = {
      id: "g1",
      kind: "group",
      label: "Custom",
      width: 190,
      height: 210,
      color: "#3388aa",
    };
    renderInFlow("g1", node);
    const frame = screen.getByTestId("group-node");
    expect(frame.style.border).toBe(
      `1.5px dashed ${withAlpha("#3388aa", 0.55)}`,
    );
    const header = screen.getByTestId("group-label");
    // jsdom normalizes hex → rgb() when reading `.style.border` back.
    expect(header.style.border).toBe("1px solid rgb(51, 136, 170)");
  });
});
