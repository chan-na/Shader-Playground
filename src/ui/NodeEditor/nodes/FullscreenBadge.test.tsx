import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePassPlanStore } from "../../../state/passPlanStore";
import { FullscreenBadge } from "./FullscreenBadge";

afterEach(() => {
  cleanup();
  usePassPlanStore.getState().reset();
});

describe("FullscreenBadge", () => {
  it("renders nothing when the node has no fullscreenByNode entry at all", () => {
    render(<FullscreenBadge nodeId="s1" />);
    expect(screen.queryByTestId("node-fullscreen-s1")).toBeNull();
  });

  it("renders nothing when the node's fullscreenByNode entry is false", () => {
    usePassPlanStore.getState().publish([], { s1: false }, {});
    render(<FullscreenBadge nodeId="s1" />);
    expect(screen.queryByTestId("node-fullscreen-s1")).toBeNull();
  });

  it("renders the FULLSCREEN pill once the node is marked fullscreen", () => {
    usePassPlanStore.getState().publish([], { s1: true }, {});
    render(<FullscreenBadge nodeId="s1" />);
    const badge = screen.getByTestId("node-fullscreen-s1");
    expect(badge.textContent).toBe("FULLSCREEN");
    // Tooltip wording is pinned as cause-NEUTRAL: fullscreenByNode is also
    // true when a mesh edge EXISTS but doesn't resolve (asset not loaded,
    // compute pass failed to build), so the title must not claim the input
    // is absent ("없어") — that would contradict a visibly connected edge.
    expect(badge.getAttribute("title")).toBe(
      "mesh 입력이 해석되지 않아 fullscreen.vert로 컴파일됨 — vertex 탭 참조",
    );
  });

  it("only renders the badge for the node it was given, not other nodes", () => {
    usePassPlanStore.getState().publish([], { s1: false, s2: true }, {});
    render(<FullscreenBadge nodeId="s1" />);
    expect(screen.queryByTestId("node-fullscreen-s1")).toBeNull();
  });
});
