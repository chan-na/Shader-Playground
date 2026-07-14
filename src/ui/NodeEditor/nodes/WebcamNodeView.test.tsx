import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  __setGetUserMediaForTests,
  disposeAllExternal,
  reconcileExternal,
} from "../../../core/external/registry";
import type { WebcamGraphNode } from "../../../core/graph/types";
import { WebcamNodeView } from "./WebcamNodeView";

function mockProps(id: string, node: WebcamGraphNode): NodeProps {
  return { id, data: { node } } as unknown as NodeProps;
}

/** ReactFlow's Handle requires ReactFlowProvider context to mount. */
function renderInFlow(element: ReactElement) {
  return render(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

afterEach(() => {
  cleanup();
  __setGetUserMediaForTests(null);
  disposeAllExternal();
});

describe("WebcamNodeView — permission states (M7-U3)", () => {
  it("renders the blocked badge + 'no signal' placeholder when getUserMedia is denied", async () => {
    __setGetUserMediaForTests(() =>
      Promise.reject(new DOMException("blocked", "NotAllowedError")),
    );
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    const node: WebcamGraphNode = { id: "w1", kind: "webcam" };

    renderInFlow(<WebcamNodeView {...mockProps("w1", node)} />);

    // The very first render is "pending" (initial state, before the first
    // poll observes the rejection) — wait for the *denied* copy specifically
    // rather than just the (also-pending-visible) blocked badge.
    await waitFor(
      () => {
        expect(screen.getByTestId("webcam-node").textContent).toContain(
          "camera blocked",
        );
      },
      { timeout: 3000 },
    );
    expect(screen.getByTestId("node-blocked-w1")).not.toBeNull();
    expect(screen.getByText("no signal")).not.toBeNull();
    expect(screen.getByTestId("webcam-node").className).toContain(
      "node-card--blocked",
    );
  });

  it("renders no blocked badge once the stream is ready", async () => {
    const stream = {
      getTracks: () => [{ stop: () => {} }],
    } as unknown as MediaStream;
    __setGetUserMediaForTests(() => Promise.resolve(stream));
    reconcileExternal([{ nodeId: "w1", kind: "webcam" }]);
    const node: WebcamGraphNode = { id: "w1", kind: "webcam" };

    renderInFlow(<WebcamNodeView {...mockProps("w1", node)} />);

    await waitFor(
      () => {
        expect(screen.queryByTestId("node-blocked-w1")).toBeNull();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByText("no signal")).toBeNull();
  });
});
