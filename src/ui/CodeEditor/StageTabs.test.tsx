import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageTabs } from "./StageTabs";

afterEach(() => {
  cleanup();
});

describe("StageTabs", () => {
  it("renders both tabs with the vertex.glsl / fragment.glsl display labels", () => {
    render(
      <StageTabs
        active="vertex"
        onChange={() => {}}
        vertexHasError={false}
        fragmentHasError={false}
      />,
    );
    expect(screen.getByText("vertex.glsl")).not.toBeNull();
    expect(screen.getByText("fragment.glsl")).not.toBeNull();
  });

  it("keeps stage-tab-vertex / stage-tab-fragment testids stable (E2E phase-24..28 depend on these)", () => {
    render(
      <StageTabs
        active="vertex"
        onChange={() => {}}
        vertexHasError={false}
        fragmentHasError={false}
      />,
    );
    expect(screen.getByTestId("stage-tab-vertex")).not.toBeNull();
    expect(screen.getByTestId("stage-tab-fragment")).not.toBeNull();
  });

  it("marks only the active tab with data-active=true and the stage-tab--active class", () => {
    render(
      <StageTabs
        active="fragment"
        onChange={() => {}}
        vertexHasError={false}
        fragmentHasError={false}
      />,
    );
    const vertexTab = screen.getByTestId("stage-tab-vertex");
    const fragmentTab = screen.getByTestId("stage-tab-fragment");
    expect(vertexTab.getAttribute("data-active")).toBe("false");
    expect(vertexTab.className).toBe("stage-tab");
    expect(fragmentTab.getAttribute("data-active")).toBe("true");
    expect(fragmentTab.className).toBe("stage-tab stage-tab--active");
  });

  it("renders the error dot only on the fragment tab when fragmentHasError is true", () => {
    render(
      <StageTabs
        active="vertex"
        onChange={() => {}}
        vertexHasError={false}
        fragmentHasError={true}
      />,
    );
    const vertexTab = screen.getByTestId("stage-tab-vertex");
    const fragmentTab = screen.getByTestId("stage-tab-fragment");
    expect(vertexTab.querySelector(".stage-tab-error-dot")).toBeNull();
    expect(fragmentTab.querySelector(".stage-tab-error-dot")).not.toBeNull();
  });

  it("calls onChange with the clicked tab's stage", () => {
    const onChange = vi.fn();
    render(
      <StageTabs
        active="vertex"
        onChange={onChange}
        vertexHasError={false}
        fragmentHasError={false}
      />,
    );
    fireEvent.click(screen.getByTestId("stage-tab-fragment"));
    expect(onChange).toHaveBeenCalledWith("fragment");

    fireEvent.click(screen.getByTestId("stage-tab-vertex"));
    expect(onChange).toHaveBeenCalledWith("vertex");
  });

  it("defaults to the vertex.glsl label and data-auto=false when vertexAuto is omitted", () => {
    render(
      <StageTabs
        active="vertex"
        onChange={() => {}}
        vertexHasError={false}
        fragmentHasError={false}
      />,
    );
    expect(screen.getByText("vertex.glsl")).not.toBeNull();
    expect(
      screen.getByTestId("stage-tab-vertex").getAttribute("data-auto"),
    ).toBe("false");
  });

  it("swaps the vertex tab to 'fullscreen.vert (auto)' + data-auto=true when vertexAuto is true (A-1)", () => {
    render(
      <StageTabs
        active="vertex"
        onChange={() => {}}
        vertexHasError={false}
        fragmentHasError={false}
        vertexAuto={true}
      />,
    );
    expect(screen.queryByText("vertex.glsl")).toBeNull();
    expect(screen.getByText("fullscreen.vert (auto)")).not.toBeNull();
    expect(
      screen.getByTestId("stage-tab-vertex").getAttribute("data-auto"),
    ).toBe("true");
    // The fragment tab is untouched by vertexAuto — no data-auto attribute
    // at all (not even "false"), and its label is unchanged.
    expect(
      screen.getByTestId("stage-tab-fragment").hasAttribute("data-auto"),
    ).toBe(false);
    expect(screen.getByText("fragment.glsl")).not.toBeNull();
  });

  it("keeps the auto label while the FRAGMENT tab is active — the label states doc truth, not stage truth", () => {
    // vertexAuto describes the vertex *document* (is it the substituted
    // fullscreen.vert?), which is true regardless of which tab the user is
    // looking at. editorStore's default stage is "fragment", so this is the
    // state a fullscreen node is first seen in — the label must already be
    // honest there, without a vertex-tab click.
    render(
      <StageTabs
        active="fragment"
        onChange={() => {}}
        vertexHasError={false}
        fragmentHasError={false}
        vertexAuto={true}
      />,
    );
    const vertexTab = screen.getByTestId("stage-tab-vertex");
    expect(vertexTab.getAttribute("data-active")).toBe("false");
    expect(vertexTab.getAttribute("data-auto")).toBe("true");
    expect(screen.queryByText("vertex.glsl")).toBeNull();
    expect(screen.getByText("fullscreen.vert (auto)")).not.toBeNull();
  });
});
