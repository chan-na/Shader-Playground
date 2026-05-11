import { useState } from 'react';
import { Inspector } from './Inspector';
import { ProblemsPanel } from './ProblemsPanel';
import { AssetBrowser } from './AssetBrowser';
import { useDiagnosticsStore } from '../../state/diagnosticsStore';
import { useRendererStore } from '../../state/rendererStore';
import { useAssetStore } from '../../state/assetStore';

type Tab = 'inspector' | 'problems' | 'assets';

export function SidePanel() {
  const [tab, setTab] = useState<Tab>('inspector');

  const problemCount = useDiagnosticsStore((s) => {
    let n = 0;
    for (const d of Object.values(s.byNode)) n += d.vertex.length + d.fragment.length + d.link.length;
    return n;
  });
  const runtimeErrors = useRendererStore((s) => s.stats.errors.length);
  const total = problemCount + runtimeErrors;
  const assetCount = useAssetStore(
    (s) => Object.keys(s.meshes).length + Object.keys(s.images).length,
  );

  return (
    <div className="panel panel--inspector">
      <div className="panel-tabs">
        <button
          className={tab === 'inspector' ? 'panel-tab panel-tab--active' : 'panel-tab'}
          onClick={() => setTab('inspector')}
        >
          Inspector
        </button>
        <button
          className={tab === 'assets' ? 'panel-tab panel-tab--active' : 'panel-tab'}
          onClick={() => setTab('assets')}
        >
          Assets
          {assetCount > 0 && <span className="panel-tab-badge">{assetCount}</span>}
        </button>
        <button
          className={tab === 'problems' ? 'panel-tab panel-tab--active' : 'panel-tab'}
          onClick={() => setTab('problems')}
          data-variant={total > 0 ? 'error' : undefined}
        >
          Problems
          {total > 0 && <span className="panel-tab-badge">{total}</span>}
        </button>
      </div>
      {tab === 'inspector' && <InspectorBody />}
      {tab === 'assets' && <AssetBrowser />}
      {tab === 'problems' && <ProblemsPanel />}
    </div>
  );
}

function InspectorBody() {
  return <Inspector embedded />;
}
