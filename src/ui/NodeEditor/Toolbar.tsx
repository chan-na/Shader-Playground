import { useGraphStore } from '../../state/graphStore';
import { createDemoGraph } from '../../state/demoGraph';
import { nextId } from '../../utils/id';
import basicVert from '../../shaders/basic.vert?raw';
import unlitFrag from '../../shaders/templates/unlit.frag?raw';
import type { GraphNode } from '../../core/graph/types';

const btn: React.CSSProperties = {
  background: '#3a3a3d',
  border: '1px solid #555',
  color: '#ddd',
  padding: '4px 8px',
  cursor: 'pointer',
  borderRadius: 3,
  fontSize: 11,
};

export function Toolbar() {
  const addNode = useGraphStore((s) => s.addNode);
  const setGraph = useGraphStore((s) => s.setGraph);
  const reset = useGraphStore((s) => s.reset);
  const nodes = useGraphStore((s) => s.nodes);

  const hasOutput = nodes.some((n) => n.kind === 'output');

  const addMesh = () => {
    const id = nextId('mesh');
    addNode(
      { id, kind: 'mesh', primitive: 'sphere' },
      { x: -200, y: 0 },
    );
  };
  const addImage = () => {
    const id = nextId('image');
    addNode({ id, kind: 'image', assetId: null }, { x: -200, y: 200 });
  };
  const addShader = () => {
    const id = nextId('shader');
    const node: GraphNode = {
      id,
      kind: 'shader',
      vertexSource: basicVert,
      fragmentSource: unlitFrag,
      uniformValues: { u_baseColor: [0.5, 0.7, 1.0] },
    };
    addNode(node, { x: 100, y: 0 });
  };
  const addOutput = () => {
    if (hasOutput) return;
    const id = nextId('output');
    addNode({ id, kind: 'output' }, { x: 400, y: 0 });
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: 6,
        borderBottom: '1px solid #1a1a1a',
        background: '#252526',
        flexWrap: 'wrap',
      }}
    >
      <button style={btn} onClick={addMesh}>+ Mesh</button>
      <button style={btn} onClick={addImage}>+ Image</button>
      <button style={btn} onClick={addShader}>+ Shader</button>
      <button style={btn} onClick={addOutput} disabled={hasOutput}>+ Output</button>
      <div style={{ flex: 1 }} />
      <button style={btn} onClick={() => setGraph(createDemoGraph(), {
        mesh1: { x: -240, y: 0 },
        shader1: { x: 80, y: 0 },
        output1: { x: 400, y: 0 },
      })}>Demo</button>
      <button style={btn} onClick={() => reset()}>Clear</button>
    </div>
  );
}
