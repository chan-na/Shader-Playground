import { useState } from "react";
import { useAssetStore } from "../../state/assetStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useRendererStore } from "../../state/rendererStore";
import { DockPanelHeader } from "../DockPanelHeader";
import { AssetBrowser } from "./AssetBrowser";
import { Inspector } from "./Inspector";
import { ProblemsPanel } from "./ProblemsPanel";

type Tab = "inspector" | "problems" | "assets";

export function SidePanel() {
  const [tab, setTab] = useState<Tab>("inspector");

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
          onClick={() => setTab("inspector")}
          data-testid="tab-inspector"
        >
          Inspector
        </button>
        <button
          type="button"
          className={
            tab === "assets" ? "panel-tab panel-tab--active" : "panel-tab"
          }
          onClick={() => setTab("assets")}
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
          onClick={() => setTab("problems")}
          data-variant={total > 0 ? "error" : undefined}
          data-testid="tab-problems"
        >
          Problems
          {total > 0 && <span className="panel-tab-badge">{total}</span>}
        </button>
      </DockPanelHeader>
      {tab === "inspector" && <InspectorBody />}
      {tab === "assets" && <AssetBrowser />}
      {tab === "problems" && <ProblemsPanel />}
    </div>
  );
}

function InspectorBody() {
  return <Inspector embedded />;
}
