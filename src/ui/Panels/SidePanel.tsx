import { useState } from "react";
import { useAssetStore } from "../../state/assetStore";
import { useBootstrapStore } from "../../state/bootstrapStore";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useDockStore } from "../../state/dockStore";
import { getNodeAt } from "../../state/dockTree";
import { useRendererStore } from "../../state/rendererStore";
import { DockPanelHeader } from "../DockPanelHeader";
import { useDockLeaf } from "../dockLeafContext";
import { AssetBrowser } from "./AssetBrowser";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { Inspector } from "./Inspector";
import { PanelSkeleton } from "./PanelSkeleton";
import { ProblemsPanel } from "./ProblemsPanel";

type Tab = "inspector" | "assets" | "problems" | "diagnostics";

export function SidePanel() {
  // B2-U2: inspector/assets 탭 활성 상태의 단일 출처는 dockStore leaf.active
  // — 이 leaf의 경로는 DockLayout이 심어둔 DockLeafContext로 얻는다.
  // B3-U2: inspector/assets는 이제 DockPanelHeader가 leaf.tabs에서 직접
  // dock 탭으로 렌더한다(탭 1급화, R6) — 이 컴포넌트는 더 이상
  // `setActiveTab`을 직접 호출하지 않는다(dockActive 파생 읽기만 남음).
  // problems/diagnostics는 아직 도킹 탭이 아니므로(R5, B5까지 유지) 로컬
  // 상태/debugUiStore로 children 오버레이 탭을 그대로 그린다.
  const { path } = useDockLeaf();
  const dockActive = useDockStore((s) => {
    const n = s.tree === null ? null : getNodeAt(s.tree, path);
    return n !== null && n.type === "leaf" ? n.active : "inspector";
  });
  const [problemsOpen, setProblemsOpen] = useState(false);
  // Diagnostics 표시 여부의 단일 출처는 debugUiStore.open (StatusBar 토글 진입
  // 경로 보존, D1). 활성 탭은 여기서 파생만 한다 — 새 스토어를 만들지 않고
  // open===true일 때 diagnostics를, problemsOpen이면 problems를, 그 외엔
  // dockStore leaf.active(inspector/assets)를 그대로 보여준다.
  const diagOpen = useDebugUiStore((s) => s.open);
  const setDiagOpen = useDebugUiStore((s) => s.setOpen);
  const tab: Tab = diagOpen
    ? "diagnostics"
    : problemsOpen
      ? "problems"
      : dockActive === "assets"
        ? "assets"
        : "inspector";
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
      <DockPanelHeader
        suppressActive={diagOpen || problemsOpen}
        badges={{ assets: assetCount }}
        onTabSelect={() => {
          setDiagOpen(false);
          setProblemsOpen(false);
        }}
      >
        <button
          type="button"
          className={
            tab === "problems" ? "panel-tab panel-tab--active" : "panel-tab"
          }
          onClick={() => {
            setDiagOpen(false);
            setProblemsOpen(true);
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
