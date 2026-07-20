import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GeometryHandle, ImageHandle } from "../../core/assets/types";
import { useAssetStore } from "../../state/assetStore";
import { useBootstrapStore } from "../../state/bootstrapStore";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useDockStore } from "../../state/dockStore";
import { createDefaultDockTree, getNodeAt } from "../../state/dockTree";
import { useRendererStore } from "../../state/rendererStore";
import { DockLeafContext } from "../dockLeafContext";
import { SidePanel } from "./SidePanel";

const initialAsset = useAssetStore.getState();
const initialDiagnostics = useDiagnosticsStore.getState();
const initialRenderer = useRendererStore.getState();
const initialBootstrap = useBootstrapStore.getState();
const initialDebugUi = useDebugUiStore.getState();
const initialDock = useDockStore.getState();

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
  useDebugUiStore.setState(initialDebugUi, true);
  useDockStore.setState(
    { ...initialDock, tree: createDefaultDockTree() },
    true,
  );
  // SidePanel only shows its real tab content once bootstrap has finished
  // (M7-U1) — the store is a module singleton, so tests that don't care
  // about the loading skeleton need it forced to "done" here.
  useBootstrapStore.setState({ ...initialBootstrap, phase: "done" });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  useBootstrapStore.setState(initialBootstrap, true);
});

/** B2-U1: SidePanel now reads its collapsed state via `useDockLeaf()` (routed
 * through `DockPanelHeader`), so every render needs a `DockLeafContext`
 * provider. `l2`/`["b","b","b"]` is the default tree's inspector/assets leaf
 * (`createDefaultDockTree()`). */
function renderSidePanel() {
  return render(
    <DockLeafContext.Provider value={{ leafId: "l2", path: ["b", "b", "b"] }}>
      <SidePanel />
    </DockLeafContext.Provider>,
  );
}

describe("SidePanel", () => {
  // R5 회귀 가드: problems/diagnostics는 도킹 탭이 아니다(상태바 진입
  // 오버레이, StatusOverlays/StatusBar가 렌더한다) — SidePanel에는 그
  // testid가 존재해선 안 된다.
  it("renders the two dock tabs (inspector/assets) and switches panels on click", () => {
    renderSidePanel();

    expect(screen.getByTestId("tab-inspector")).not.toBeNull();
    expect(screen.getByTestId("tab-assets")).not.toBeNull();
    expect(screen.queryByTestId("tab-problems")).toBeNull();
    expect(screen.queryByTestId("tab-diagnostics")).toBeNull();

    expect(screen.queryByTestId("asset-browser-drop")).toBeNull();
    fireEvent.click(screen.getByTestId("tab-assets"));
    expect(screen.getByTestId("asset-browser-drop")).not.toBeNull();
  });

  // B2-U2: Inspector/Assets 탭 활성 상태는 dockStore leaf.active와 양방향
  // 동기화된다 — 아래 3건이 그 계약을 고정한다.
  it("clicking the Assets tab updates the dockStore leaf's active tab", () => {
    renderSidePanel();

    fireEvent.click(screen.getByTestId("tab-assets"));

    const tree = useDockStore.getState().tree;
    const leaf = tree === null ? null : getNodeAt(tree, ["b", "b", "b"]);
    expect(leaf !== null && leaf.type === "leaf" && leaf.active).toBe("assets");
  });

  it("setting the dockStore leaf's active tab externally shows the Assets body (reverse sync)", () => {
    renderSidePanel();

    expect(screen.queryByTestId("asset-browser-drop")).toBeNull();
    act(() => {
      useDockStore.getState().setActiveTab(["b", "b", "b"], "assets");
    });

    expect(screen.getByTestId("asset-browser-drop")).not.toBeNull();
    expect(screen.getByTestId("tab-assets").className).toContain(
      "panel-tab--active",
    );
  });

  it("shows the Assets badge with the mesh+image count", () => {
    useAssetStore.getState().addMesh(meshHandle);
    useAssetStore.getState().addImage(imageHandle);

    renderSidePanel();

    const assetsTab = screen.getByTestId("tab-assets");
    expect(assetsTab.querySelector(".panel-tab-badge")?.textContent).toBe("2");
  });

  it("shows the panel skeleton instead of tab content while bootstrap phase is not 'done'", () => {
    useBootstrapStore.setState({ ...initialBootstrap, phase: "init" });

    renderSidePanel();

    expect(screen.getByTestId("panel-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("asset-browser-drop")).toBeNull();
    // Tab headers stay visible/clickable even while the body is a skeleton.
    expect(screen.getByTestId("tab-inspector")).not.toBeNull();
  });

  it("shows the panel skeleton while a recovery prompt is pending", () => {
    useBootstrapStore.setState({ ...initialBootstrap, phase: "prompt" });

    renderSidePanel();

    expect(screen.getByTestId("panel-skeleton")).not.toBeNull();
  });

  it("swaps back to real tab content once bootstrap phase is 'done'", () => {
    useBootstrapStore.setState({ ...initialBootstrap, phase: "done" });

    renderSidePanel();

    expect(screen.queryByTestId("panel-skeleton")).toBeNull();
  });
});
