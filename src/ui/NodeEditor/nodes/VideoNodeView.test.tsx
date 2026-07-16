import { cleanup, render, screen } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { VideoGraphNode } from "../../../core/graph/types";
import { VideoNodeView } from "./VideoNodeView";

function mockProps(id: string, node: VideoGraphNode): NodeProps {
  return { id, data: { node } } as unknown as NodeProps;
}

/** ReactFlow's Handle requires ReactFlowProvider context to mount. */
function renderInFlow(element: ReactElement) {
  return render(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

afterEach(() => {
  cleanup();
});

describe("VideoNodeView — letterbox preview (V2-U3)", () => {
  it("renders the 'no asset' placeholder when assetId is null", () => {
    const node: VideoGraphNode = {
      id: "v1",
      kind: "video",
      assetId: null,
      playing: false,
      loop: false,
      muted: true,
    };

    renderInFlow(<VideoNodeView {...mockProps("v1", node)} />);

    expect(screen.getAllByText("no asset").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("video-play-glyph")).toBeNull();
    expect(screen.queryByTestId("video-scrub")).toBeNull();
  });

  it("renders the play glyph + scrub bar (0% fill) over the letterbox when paused", () => {
    const node: VideoGraphNode = {
      id: "v1",
      kind: "video",
      assetId: "v1",
      playing: false,
      loop: false,
      muted: true,
    };

    renderInFlow(<VideoNodeView {...mockProps("v1", node)} />);

    const glyph = screen.getByTestId("video-play-glyph");
    expect(glyph).not.toBeNull();

    const scrub = screen.getByTestId("video-scrub") as HTMLElement;
    expect(scrub).not.toBeNull();
    const fill = scrub.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");

    // Raw #000 regression guard — letterbox owns the background, not <video>.
    const video = scrub.parentElement?.querySelector(
      "video",
    ) as HTMLVideoElement;
    expect(video.style.background).toBe("");
    const letterbox = video.parentElement?.parentElement as HTMLElement;
    expect(letterbox.style.background).toContain("var(--surface-letterbox)");
  });

  it("hides the play glyph while playing", () => {
    const node: VideoGraphNode = {
      id: "v1",
      kind: "video",
      assetId: "v1",
      playing: true,
      loop: false,
      muted: true,
    };

    renderInFlow(<VideoNodeView {...mockProps("v1", node)} />);

    expect(screen.queryByTestId("video-play-glyph")).toBeNull();
    expect(screen.getByTestId("video-scrub")).not.toBeNull();
  });
});
