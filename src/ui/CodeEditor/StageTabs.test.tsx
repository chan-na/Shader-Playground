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
});
