import { useAssetStore } from "../../state/assetStore";
import { useBootstrapStore } from "../../state/bootstrapStore";
import { useDockStore } from "../../state/dockStore";
import { getNodeAt } from "../../state/dockTree";
import { DockPanelHeader } from "../DockPanelHeader";
import { useDockLeaf } from "../dockLeafContext";
import { AssetBrowser } from "./AssetBrowser";
import { Inspector } from "./Inspector";
import { PanelSkeleton } from "./PanelSkeleton";

export function SidePanel() {
  // B2-U2: inspector/assets 탭 활성 상태의 단일 출처는 dockStore leaf.active
  // — 이 leaf의 경로는 DockLayout이 심어둔 DockLeafContext로 얻는다.
  // B3-U2: inspector/assets는 DockPanelHeader가 leaf.tabs에서 직접 dock
  // 탭으로 렌더한다(탭 1급화, R6) — 이 컴포넌트는 `setActiveTab`을 직접
  // 호출하지 않는다(dockActive 파생 읽기만 남음).
  // B5/R5: problems→상태바 카운트(StatusBar), diagnostics→하단 트랜지언트
  // 오버레이(StatusOverlays, 단일 출처 debugUiStore.open 유지) — 둘 다 도킹
  // 탭이 아니므로 이 컴포넌트에는 더 이상 존재하지 않는다.
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
