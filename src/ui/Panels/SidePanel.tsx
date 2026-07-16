import { useState } from "react";
import { useAssetStore } from "../../state/assetStore";
import { useBootstrapStore } from "../../state/bootstrapStore";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useRendererStore } from "../../state/rendererStore";
import { DockPanelHeader } from "../DockPanelHeader";
import { AssetBrowser } from "./AssetBrowser";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { Inspector } from "./Inspector";
import { PanelSkeleton } from "./PanelSkeleton";
import { ProblemsPanel } from "./ProblemsPanel";

type Tab = "inspector" | "assets" | "problems" | "diagnostics";

export function SidePanel() {
  const [localTab, setLocalTab] =
    useState<Exclude<Tab, "diagnostics">>("inspector");
  // Diagnostics 표시 여부의 단일 출처는 debugUiStore.open (StatusBar 토글 진입
  // 경로 보존, D1). 활성 탭은 여기서 파생만 한다 — 새 스토어를 만들지 않고
  // open===true일 때 diagnostics를, 아니면 마지막으로 고른 로컬 탭을 보여준다.
  const diagOpen = useDebugUiStore((s) => s.open);
  const setDiagOpen = useDebugUiStore((s) => s.setOpen);
  const tab: Tab = diagOpen ? "diagnostics" : localTab;
  const bootPhase = useBootstrapStore((s) => s.phase);

  const problemCount = useDiagnosticsStore((s) => {
    let n = 0;
    for (const d of Object.values(s.byNode))
      n += d.vertex.length + d.fragment.length + d.link.length;
    return n;
  });
  const runtimeErrors = useRendererStore((s) => s.stats.errors.length);
  const total = problemCount + runtimeErrors;
  const assetCount = useAssetStore(
    (s) => Object.keys(s.meshes).length + Object.keys(s.images).length,
  );

  return (
    <div className="panel panel--inspector" data-testid="side-panel">
      <DockPanelHeader panelId="sidePanel">
        <button
          type="button"
          className={
            tab === "inspector" ? "panel-tab panel-tab--active" : "panel-tab"
          }
          onClick={() => {
            setDiagOpen(false);
            setLocalTab("inspector");
          }}
          data-testid="tab-inspector"
        >
          Inspector
        </button>
        <button
          type="button"
          className={
            tab === "assets" ? "panel-tab panel-tab--active" : "panel-tab"
          }
          onClick={() => {
            setDiagOpen(false);
            setLocalTab("assets");
          }}
          data-testid="tab-assets"
        >
          Assets
          {assetCount > 0 && (
            <span className="panel-tab-badge">{assetCount}</span>
          )}
        </button>
        <button
          type="button"
          className={
            tab === "problems" ? "panel-tab panel-tab--active" : "panel-tab"
          }
          onClick={() => {
            setDiagOpen(false);
            setLocalTab("problems");
          }}
          data-variant={total > 0 ? "error" : undefined}
          data-testid="tab-problems"
        >
          Problems
          {total > 0 && <span className="panel-tab-badge">{total}</span>}
        </button>
        <button
          type="button"
          className={
            tab === "diagnostics" ? "panel-tab panel-tab--active" : "panel-tab"
          }
          onClick={() => setDiagOpen(true)}
          data-testid="tab-diagnostics"
        >
          Diagnostics
        </button>
      </DockPanelHeader>
      {bootPhase !== "done" ? (
        <PanelSkeleton />
      ) : (
        <>
          {tab === "inspector" && <InspectorBody />}
          {tab === "assets" && <AssetBrowser />}
          {tab === "problems" && <ProblemsPanel />}
          {tab === "diagnostics" && <DiagnosticsPanel />}
        </>
      )}
    </div>
  );
}

function InspectorBody() {
  return <Inspector embedded />;
}
