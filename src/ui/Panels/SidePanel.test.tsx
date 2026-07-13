import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GeometryHandle, ImageHandle } from "../../core/assets/types";
import { useAssetStore } from "../../state/assetStore";
import {
  emptyDiagnostics,
  useDiagnosticsStore,
} from "../../state/diagnosticsStore";
import { useRendererStore } from "../../state/rendererStore";
import { SidePanel } from "./SidePanel";

const initialAsset = useAssetStore.getState();
const initialDiagnostics = useDiagnosticsStore.getState();
const initialRenderer = useRendererStore.getState();

const meshHandle: GeometryHandle = {
  id: "mesh-1",
  name: "a.obj",
  data: { attributes: [], vertexCount: 3 },
};
const imageHandle: ImageHandle = {
  id: "img-1",
  name: "a.png",
  width: 4,
  height: 4,
  bitmap: null,
};

function resetStores() {
  useAssetStore.setState(initialAsset, true);
  useDiagnosticsStore.setState(initialDiagnostics, true);
  useRendererStore.setState(initialRenderer, true);
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

describe("SidePanel", () => {
  it("renders the three tabs and switches panels on click", () => {
    render(<SidePanel />);

    expect(screen.getByTestId("tab-inspector")).not.toBeNull();
    expect(screen.getByTestId("tab-assets")).not.toBeNull();
    expect(screen.getByTestId("tab-problems")).not.toBeNull();

    expect(screen.queryByTestId("asset-browser-drop")).toBeNull();
    fireEvent.click(screen.getByTestId("tab-assets"));
    expect(screen.getByTestId("asset-browser-drop")).not.toBeNull();
  });

  it("shows the Problems badge as an error pill when diagnostics + runtime errors are present", () => {
    useDiagnosticsStore.getState().set("s1", {
      ...emptyDiagnostics(),
      vertex: [{ line: 1, severity: "error", message: "a" }],
      fragment: [{ line: 2, severity: "warning", message: "b" }],
    });
    useRendererStore.setState((s) => ({
      stats: { ...s.stats, errors: ["boom"] },
    }));

    render(<SidePanel />);

    const problemsTab = screen.getByTestId("tab-problems");
    expect(problemsTab.getAttribute("data-variant")).toBe("error");
    expect(problemsTab.querySelector(".panel-tab-badge")?.textContent).toBe(
      "3",
    );
  });

  it("hides the Problems badge when there are no diagnostics or runtime errors", () => {
    render(<SidePanel />);

    const problemsTab = screen.getByTestId("tab-problems");
    expect(problemsTab.getAttribute("data-variant")).toBeNull();
    expect(problemsTab.querySelector(".panel-tab-badge")).toBeNull();
  });

  it("shows the Assets badge with the mesh+image count", () => {
    useAssetStore.getState().addMesh(meshHandle);
    useAssetStore.getState().addImage(imageHandle);

    render(<SidePanel />);

    const assetsTab = screen.getByTestId("tab-assets");
    expect(assetsTab.querySelector(".panel-tab-badge")?.textContent).toBe("2");
  });
});
