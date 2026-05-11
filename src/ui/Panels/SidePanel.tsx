import { useState } from 'react';
import { Inspector } from './Inspector';
import { ProblemsPanel } from './ProblemsPanel';
import { useDiagnosticsStore } from '../../state/diagnosticsStore';
import { useRendererStore } from '../../state/rendererStore';

type Tab = 'inspector' | 'problems';

export function SidePanel() {
  const [tab, setTab] = useState<Tab>('inspector');

  const problemCount = useDiagnosticsStore((s) => {
    let n = 0;
    for (const d of Object.values(s.byNode)) n += d.vertex.length + d.fragment.length + d.link.length;
    return n;
  });
  const runtimeErrors = useRendererStore((s) => s.stats.errors.length);
  const total = problemCount + runtimeErrors;

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
          className={tab === 'problems' ? 'panel-tab panel-tab--active' : 'panel-tab'}
          onClick={() => setTab('problems')}
        >
          Problems
          {total > 0 && (
            <span className="panel-tab-badge">{total}</span>
          )}
        </button>
      </div>
      {tab === 'inspector' ? <InspectorBody /> : <ProblemsPanel />}
    </div>
  );
}

function InspectorBody() {
  return <Inspector embedded />;
}
