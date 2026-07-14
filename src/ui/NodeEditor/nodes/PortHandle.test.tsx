import { cleanup, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ConnectionDragSource } from "../../../state/connectionUiStore";
import { useConnectionUiStore } from "../../../state/connectionUiStore";
import { tokens } from "../../../theme";
import { PortHandle } from "./PortHandle";

/**
 * NOTE on render method: unlike ConnectionLine.test.tsx/nodeViews.test.tsx
 * (renderToStaticMarkup), this file uses @testing-library/react's `render`
 * (client render, same as WebcamNodeView.test.tsx which also mounts a
 * Handle-bearing view). PortHandle subscribes to connectionUiStore through
 * the `useConnectionUiStore(selector)` *hook* (not `.getState()`), and
 * zustand's react binding feeds `useSyncExternalStore` a `getServerSnapshot`
 * that always returns the store's state *at module load* — so under
 * `renderToStaticMarkup`, a `setState()` call made before rendering would
 * never show up in the markup (verified directly against zustand's
 * react.js: `getServerSnapshot = () => selector(api.getInitialState())`).
 * Client rendering reads the live `getState()` instead, which is what these
 * dragging-state assertions need.
 *
 * NOTE on the `origin` mode: `useNodeId()` only resolves once React Flow
 * itself renders a node type inside `<ReactFlow>` and supplies its
 * `NodeIdContext` — mounting a bare `<PortHandle>` under `ReactFlowProvider`
 * (no actual `<ReactFlow>` node tree) always sees `nodeId === null`, so the
 * `origin` branch can't be exercised at this level. It's covered instead by
 * portDragMode.test.ts's direct unit tests of the pure classifier.
 */
function renderInFlow(element: ReactElement) {
  return render(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

/** jsdom normalizes inline hex colors to `rgb(r, g, b)` when read back off
 *  `element.style`, so assertions on family color compare against this
 *  instead of the raw `#rrggbb` token. */
function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

const floatOut: ConnectionDragSource = {
  nodeId: "other-node",
  handleId: "value",
  side: "out",
  portType: "float",
};

afterEach(() => {
  cleanup();
  useConnectionUiStore.setState({ dragging: null, snap: null });
});

describe("PortHandle — drag fanout highlight (M8-U3)", () => {
  it("idle when no drag is in progress: no pulse ring, no forced opacity", () => {
    const { container } = renderInFlow(
      <PortHandle port={{ name: "in1", type: "float" }} side="in" top={40} />,
    );
    expect(container.querySelector(".sp-port-pulse-ring")).toBeNull();
    const handle = container.querySelector(".port-handle--in");
    expect(handle).not.toBeNull();
    expect((handle as HTMLElement).style.opacity).toBe("");
  });

  it("opposite-side, mismatched type while dragging: dimmed to opacity 0.4", () => {
    useConnectionUiStore.getState().startDrag(floatOut);
    const { container } = renderInFlow(
      <PortHandle port={{ name: "in1", type: "vec3" }} side="in" top={40} />,
    );
    const handle = container.querySelector(".port-handle--in") as HTMLElement;
    expect(handle.style.opacity).toBe("0.4");
    expect(container.querySelector(".sp-port-pulse-ring")).toBeNull();
  });

  it("opposite-side, matching type while dragging: pulse ring + family glow, not dimmed", () => {
    useConnectionUiStore.getState().startDrag(floatOut);
    const { container } = renderInFlow(
      <PortHandle port={{ name: "in1", type: "float" }} side="in" top={40} />,
    );
    const handle = container.querySelector(".port-handle--in") as HTMLElement;
    expect(handle.style.opacity).not.toBe("0.4");
    // jsdom's cssstyle leaves box-shadow's color component as the raw hex it
    // was given (unlike `border`, which it normalizes to rgb() below).
    expect(handle.style.boxShadow).toContain(tokens.portFamily.scalar);
    const ring = container.querySelector(
      ".sp-port-pulse-ring",
    ) as HTMLElement | null;
    expect(ring).not.toBeNull();
    expect(ring?.style.border).toContain(hexToRgb(tokens.portFamily.scalar));
  });

  it("same-side port never dims/highlights even while dragging (not a fanout candidate)", () => {
    useConnectionUiStore.getState().startDrag(floatOut);
    const { container } = renderInFlow(
      <PortHandle port={{ name: "out2", type: "vec3" }} side="out" top={40} />,
    );
    const handle = container.querySelector(".port-handle--out") as HTMLElement;
    expect(handle.style.opacity).toBe("");
    expect(container.querySelector(".sp-port-pulse-ring")).toBeNull();
  });

  it("dimmed prop alone (no drag in progress) still fades to opacity 0.4", () => {
    const { container } = renderInFlow(
      <PortHandle
        port={{ name: "out1", type: "mesh" }}
        side="out"
        top={40}
        dimmed
      />,
    );
    const handle = container.querySelector(".port-handle--out") as HTMLElement;
    expect(handle.style.opacity).toBe("0.4");
  });
});

describe("PortHandle — connection snap ring (M8-U4)", () => {
  /**
   * NOTE: the positive case (this port's snap matches -> ring renders) can't
   * be exercised here. `snapSeqFor` requires `snap.nodeId === nodeId`, and
   * (per the NOTE at the top of this file) `useNodeId()` is always `null`
   * for a bare `<PortHandle>` mounted outside a real `<ReactFlow>` node
   * tree — while `connectionUiStore.snap.nodeId` is always a non-null
   * string (set by `triggerSnap(conn.target, ...)`), so the two can never
   * compare equal at this render level. That positive path is covered by
   * `snapSeqFor`'s own unit tests in portDragMode.test.ts instead; the
   * render-level tests below only assert the negative cases.
   */
  it("no ring when the store's snap belongs to a different port", () => {
    useConnectionUiStore.getState().triggerSnap("other-node", "in1");
    const { container } = renderInFlow(
      <PortHandle port={{ name: "in1", type: "float" }} side="in" top={40} />,
    );
    expect(container.querySelector(".sp-port-snap-ring")).toBeNull();
  });

  it("no ring on an output port even when the store's snap targets that same handle name", () => {
    useConnectionUiStore.getState().triggerSnap("other-node", "out1");
    const { container } = renderInFlow(
      <PortHandle port={{ name: "out1", type: "float" }} side="out" top={40} />,
    );
    expect(container.querySelector(".sp-port-snap-ring")).toBeNull();
  });
});
