import { useAssetStore } from "../../state/assetStore";
import { useBootstrapStore } from "../../state/bootstrapStore";
import { DockPanelHeader } from "../dock/DockPanelHeader";
import { useDockLeaf } from "../dock/dockLeafContext";
import { useDockStore } from "../dock/dockStore";
import { getNodeAt } from "../dock/tree";
import { AssetBrowser } from "./AssetBrowser";
import { Inspector } from "./Inspector";
import { PanelSkeleton } from "./PanelSkeleton";

export function SidePanel() {
  // inspector/assets 탭 활성 상태의 단일 출처는 dockStore leaf.active
  // — 이 leaf의 경로는 DockLayout이 심어둔 DockLeafContext로 얻는다.
  // 탭 자체는 DockPanelHeader가 leaf.tabs에서 직접 렌더하므로 이 컴포넌트는
  // `setActiveTab`을 호출하지 않는다(dockActive 파생 읽기만).
  // problems(StatusBar 카운트)·diagnostics(StatusOverlays)는 도킹 탭이
  // 아니므로 여기서 렌더하지 않는다.
  const { path } = useDockLeaf();
  const dockActive = useDockStore((s) => {
    const n = s.tree === null ? null : getNodeAt(s.tree, path);
    return n !== null && n.type === "leaf" ? n.active : "inspector";
  });
  const bootPhase = useBootstrapStore((s) => s.phase);

  const assetCount = useAssetStore(
    (s) => Object.keys(s.meshes).length + Object.keys(s.images).length,
  );

  return (
    <div className="panel panel--inspector" data-testid="side-panel">
      <DockPanelHeader badges={{ assets: assetCount }} />
      {bootPhase !== "done" ? (
        <PanelSkeleton />
      ) : dockActive === "assets" ? (
        <AssetBrowser />
      ) : (
        <InspectorBody />
      )}
    </div>
  );
}

function InspectorBody() {
  return <Inspector embedded />;
}
