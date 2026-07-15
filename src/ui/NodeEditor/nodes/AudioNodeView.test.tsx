import { cleanup, render } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { disposeAllExternal } from "../../../core/external/registry";
import type { AudioGraphNode } from "../../../core/graph/types";
import { AudioNodeView } from "./AudioNodeView";

function mockProps(id: string, node: AudioGraphNode): NodeProps {
  return { id, data: { node } } as unknown as NodeProps;
}

/** ReactFlow's Handle requires ReactFlowProvider context to mount. */
function renderInFlow(element: ReactElement) {
  return render(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

afterEach(() => {
  cleanup();
  disposeAllExternal();
});

describe("AudioNodeView — waveform canvas (V2-U2)", () => {
  it("renders the 'no asset' placeholder for file mode with no assetId", () => {
    const node: AudioGraphNode = {
      id: "a1",
      kind: "audio",
      sourceKind: "file",
      assetId: null,
      fftSize: 512,
      smoothing: 0.8,
      playing: false,
      loop: false,
    };

    const { container } = renderInFlow(
      <AudioNodeView {...mockProps("a1", node)} />,
    );

    // Both the placeholder and the meta line read "no asset" here (no
    // assetId means sourceLabel falls back to the same string), so assert
    // on the placeholder element specifically rather than by text.
    expect(
      container.querySelector(".node-card__placeholder")?.textContent,
    ).toBe("no asset");
  });

  it("renders the blocked skin while mic permission is pending (unregistered node)", () => {
    const node: AudioGraphNode = {
      id: "a2",
      kind: "audio",
      sourceKind: "mic",
      assetId: null,
      fftSize: 512,
      smoothing: 0.8,
      playing: false,
      loop: false,
    };

    const { getByTestId, getByText } = renderInFlow(
      <AudioNodeView {...mockProps("a2", node)} />,
    );

    const card = getByTestId("audio-node");
    expect(card.className).toContain("node-card--blocked");
    expect(getByText("awaiting permission…")).not.toBeNull();
    expect(getByText("muted")).not.toBeNull();
  });

  it("draws a transparent canvas dimmed while not-ready", () => {
    const node: AudioGraphNode = {
      id: "a3",
      kind: "audio",
      sourceKind: "file",
      assetId: "asset-1",
      fftSize: 512,
      smoothing: 0.8,
      playing: false,
      loop: false,
    };

    const { container } = renderInFlow(
      <AudioNodeView {...mockProps("a3", node)} />,
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    // Regression guard: canvas must not carry a raw black inline background —
    // it should stay transparent so the card gradient shows through [D7].
    expect(canvas?.style.background).toBe("");
    // Node isn't registered/ready yet, so the canvas stays dimmed.
    expect(canvas?.style.opacity).toBe("0.4");
  });
});
