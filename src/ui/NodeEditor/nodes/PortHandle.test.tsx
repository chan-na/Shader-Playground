import { cleanup, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { ConnectionDragSource } from "../../../state/connectionUiStore";
import { useConnectionUiStore } from "../../../state/connectionUiStore";
import { PORT_DIAMETER, tokens } from "../../../theme";
import {
  multiPortBodyMinH,
  multiPortPreviewH,
  PORT_STRIDE_MULTI,
  PORT_TOP_PAD,
  PortHandle,
} from "./PortHandle";

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
 *
 * NOTE on the "shape recipe" describe below (todo D1): those assertions fix
 * the *idle*, store-independent shape/color CSS recipe (hollow ring vs solid
 * disc + glow) rather than any dragging/snap state, so they use
 * `renderToStaticMarkup` (like nodeViews.test.tsx's `renderInFlow`) instead
 * of this file's client `render` — a plain string assertion is enough and
 * keeps that describe decoupled from connectionUiStore/jsdom style
 * normalization concerns entirely.
 */
function renderInFlow(element: ReactElement) {
  return render(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

/** Static-markup variant used only by the shape-recipe describe below —
 *  see the NOTE above for why this describe doesn't use `renderInFlow`. */
function renderInFlowStatic(element: ReactElement): string {
  return renderToStaticMarkup(<ReactFlowProvider>{element}</ReactFlowProvider>);
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

describe("PortHandle — shape recipe (todo D1)", () => {
  it("input = hollow ring: family-color border, card-solid fill inside", () => {
    const html = renderInFlowStatic(
      <PortHandle port={{ name: "in1", type: "float" }} side="in" top={40} />,
    );
    expect(html).toContain(`border:2.5px solid ${tokens.portFamily.scalar}`);
    expect(html).toContain("background:var(--surface-node-card-solid)");
  });

  it("output = solid disc + glow: family-color fill, card-solid border, portOutputGlow shadow", () => {
    const html = renderInFlowStatic(
      <PortHandle
        port={{ name: "out1", type: "texture" }}
        side="out"
        top={40}
      />,
    );
    expect(html).toContain(`background:${tokens.portFamily.resource}`);
    expect(html).toContain("border:2px solid var(--surface-node-card-solid)");
    expect(html).toContain(
      `box-shadow:${tokens.shadow.portOutputGlow(tokens.portFamily.resource)}`,
    );
  });

  it("rail label recipe (M8-U1): in-side class + family color", () => {
    const html = renderInFlowStatic(
      <PortHandle port={{ name: "in1", type: "float" }} side="in" top={40} />,
    );
    expect(html).toContain("node-card__port-label--in");
    expect(html).toContain(`color:${tokens.portFamily.scalar}`);
  });
});

/**
 * [C-3] Multi-port vertical rhythm. The property that matters is containment:
 * a uniform-driven card gains one port per uniform, and no port may fall
 * outside the card — that overflow (4th port escaping the fixed 144px card) is
 * exactly what this rule was raised to fix.
 */
describe("multi-port card geometry [C-3]", () => {
  /** Card-relative bottom edge of the last port, mirroring the view's own
   *  `top={PORT_TOP_PAD + i * PORT_STRIDE_MULTI}` placement. */
  const lastPortBottom = (n: number) =>
    PORT_TOP_PAD + (n - 1) * PORT_STRIDE_MULTI + PORT_DIAMETER.card;

  const SHADER_CHROME = 48; // header 30 + body padding 9 + 9
  const COMPUTE_CHROME = 47; // header 30 + body padding 8 + 9

  it("keeps the 96px default thumbnail until the port span outgrows it", () => {
    expect(multiPortPreviewH(1)).toBe(96);
    expect(multiPortPreviewH(3)).toBe(96);
  });

  it("grows the shader thumbnail so every port stays inside the card", () => {
    for (let n = 1; n <= 10; n++) {
      const cardH = SHADER_CHROME + multiPortPreviewH(n);
      expect(lastPortBottom(n)).toBeLessThanOrEqual(cardH);
    }
  });

  it("grows the compute body so every port stays inside the card", () => {
    for (let n = 1; n <= 10; n++) {
      const cardH = COMPUTE_CHROME + multiPortBodyMinH(n);
      expect(lastPortBottom(n)).toBeLessThanOrEqual(cardH);
    }
  });

  it("regression: a 5-port shader no longer overflows the old fixed 144px card", () => {
    // Pre-C-3 the card was header+pad+96+pad = 144 regardless of port count.
    // The request doc says overflow starts at the 4th port, but that figure is
    // in the dc's geometry (port 0 at top:64). In this implementation port 0
    // sits at PORT_TOP_PAD(38), so 4 ports still fit (139 <= 144) and the 5th
    // is the first to escape — hence 5, not 4, is the regression case here.
    expect(lastPortBottom(4)).toBeLessThanOrEqual(144);
    expect(lastPortBottom(5)).toBeGreaterThan(144);
    expect(SHADER_CHROME + multiPortPreviewH(5)).toBeGreaterThanOrEqual(
      lastPortBottom(5),
    );
  });

  it("compute keeps a content-sized body (no 96 floor) at low port counts", () => {
    // Unlike the shader thumbnail there is no 96 floor — the kv list's own
    // height wins until the port span exceeds it.
    expect(multiPortBodyMinH(1)).toBeLessThan(96);
    expect(multiPortBodyMinH(2)).toBeLessThan(96);
  });
});
