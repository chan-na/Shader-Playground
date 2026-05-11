import { useRendererStore } from '../../state/rendererStore';
import { useGraphStore } from '../../state/graphStore';

export function StatusBar() {
  const stats = useRendererStore((s) => s.stats);
  const ready = useRendererStore((s) => s.ready);
  const nodeCount = useGraphStore((s) => s.nodes.length);
  const edgeCount = useGraphStore((s) => s.edges.length);

  const errorCount = stats.errors.length;

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        padding: '4px 10px',
        background: '#181818',
        borderTop: '1px solid #0f0f0f',
        color: '#bbb',
        fontSize: 11,
        height: 22,
      }}
    >
      <span style={{ color: ready ? '#56d698' : '#888' }}>
        ● {ready ? 'GL ready' : 'GL init'}
      </span>
      <span title="Frames per second">{stats.fps} FPS</span>
      <span title="Draw calls per frame">{stats.drawCalls} draws</span>
      <span title="Total nodes / edges in the graph">
        {nodeCount}N · {edgeCount}E
      </span>
      <div style={{ flex: 1 }} />
      {errorCount > 0 ? (
        <span
          style={{ color: '#ff6b6b' }}
          title={stats.errors.join('\n')}
        >
          ⚠ {errorCount} error{errorCount === 1 ? '' : 's'}
        </span>
      ) : (
        <span style={{ color: '#666' }}>no errors</span>
      )}
    </div>
  );
}
