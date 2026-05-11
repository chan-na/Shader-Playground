import { useGraphStore } from '../../state/graphStore';
import { createDemoGraph } from '../../state/demoGraph';
import type { MeshGraphNode, OutputGraphNode } from '../../core/graph/types';
import { PRIMITIVE_NAMES, type PrimitiveName } from '../../core/assets/primitives';

export function NodeEditor() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const addNode = useGraphStore((s) => s.addNode);
  const removeNode = useGraphStore((s) => s.removeNode);
  const setGraph = useGraphStore((s) => s.setGraph);
  const addEdge = useGraphStore((s) => s.addEdge);

  const meshNode = nodes.find((n) => n.kind === 'mesh') as MeshGraphNode | undefined;
  const outputNode = nodes.find((n) => n.kind === 'output') as OutputGraphNode | undefined;

  const setPrimitive = (p: PrimitiveName) => {
    if (!meshNode) return;
    setGraph({
      nodes: nodes.map((n) =>
        n.id === meshNode.id ? ({ ...n, primitive: p } as MeshGraphNode) : n,
      ),
      edges,
    });
  };

  const toggleOutput = () => {
    if (outputNode) {
      removeNode(outputNode.id);
    } else {
      addNode({ id: 'output1', kind: 'output' });
      // Re-link last shader → output if a shader exists
      const shader = nodes.find((n) => n.kind === 'shader');
      if (shader) {
        addEdge({
          id: `e-out-${Date.now()}`,
          source: shader.id,
          sourceHandle: 'texture',
          target: 'output1',
          targetHandle: 'texture',
        });
      }
    }
  };

  return (
    <div className="panel panel--graph">
      <div className="panel-header">Node Graph</div>
      <div className="panel-body" style={{ padding: 16, overflow: 'auto' }}>
        <div style={{ marginBottom: 12, color: '#969696', fontSize: 11 }}>
          Phase 2 dev controls — full React Flow GUI in Phase 5
        </div>
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => setGraph(createDemoGraph())}
            style={btnStyle}
          >
            Reset to demo graph
          </button>
          <button onClick={toggleOutput} style={btnStyle}>
            {outputNode ? 'Remove Output node' : 'Add Output node'}
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#969696', marginBottom: 4 }}>Mesh primitive</div>
          <select
            value={meshNode?.primitive ?? 'sphere'}
            onChange={(e) => setPrimitive(e.target.value as PrimitiveName)}
            disabled={!meshNode}
            style={selectStyle}
          >
            {PRIMITIVE_NAMES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 11, color: '#969696' }}>
          Nodes ({nodes.length}):
        </div>
        <ul style={{ margin: '4px 0 12px', paddingLeft: 18, color: '#ccc' }}>
          {nodes.map((n) => (
            <li key={n.id}>
              {n.kind} · <span style={{ color: '#888' }}>{n.id}</span>
              {n.kind === 'mesh' ? ` (${(n as MeshGraphNode).primitive})` : ''}
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 11, color: '#969696' }}>
          Edges ({edges.length}):
        </div>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#ccc' }}>
          {edges.map((e) => (
            <li key={e.id}>
              {e.source}.{e.sourceHandle} → {e.target}.{e.targetHandle}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#3a3a3d',
  border: '1px solid #555',
  color: '#ddd',
  padding: '6px 10px',
  cursor: 'pointer',
  borderRadius: 3,
  textAlign: 'left',
};

const selectStyle: React.CSSProperties = {
  background: '#3a3a3d',
  border: '1px solid #555',
  color: '#ddd',
  padding: '4px 6px',
  borderRadius: 3,
  width: '100%',
};
