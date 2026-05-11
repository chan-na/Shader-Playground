import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MeshGraphNode } from '../../../core/graph/types';
import { PRIMITIVE_NAMES, type PrimitiveName } from '../../../core/assets/primitives';
import { useGraphStore } from '../../../state/graphStore';
import { useAssetStore } from '../../../state/assetStore';

export function MeshNodeView({ id, data }: NodeProps) {
  const node = data.node as MeshGraphNode;
  const setGraph = useGraphStore((s) => s.setGraph);
  const asset = useAssetStore((s) => (node.assetId ? s.meshes[node.assetId] : undefined));

  const setPrimitive = (p: PrimitiveName) => {
    const s = useGraphStore.getState();
    setGraph({
      nodes: s.nodes.map((n) =>
        n.id === id ? ({ ...n, primitive: p, assetId: null } as MeshGraphNode) : n,
      ),
      edges: s.edges,
    });
  };

  const usingAsset = !!asset;
  const label = usingAsset ? asset!.name : node.primitive;

  return (
    <div className="node-card">
      <div className="node-card__header node-card__header--mesh">
        Mesh · {label}
      </div>
      <div className="node-card__body">
        {usingAsset ? (
          <div className="node-card__meta" style={{ fontSize: 10 }}>
            {asset!.data.vertexCount.toLocaleString()} verts
          </div>
        ) : (
          <select
            className="nodrag"
            value={node.primitive}
            onChange={(e) => setPrimitive(e.target.value as PrimitiveName)}
            style={{
              background: '#1e1e1e',
              border: '1px solid #3a3a3d',
              color: '#ddd',
              padding: '3px 4px',
              borderRadius: 3,
              fontSize: 10,
            }}
          >
            {PRIMITIVE_NAMES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>
      <Handle
        id="mesh"
        type="source"
        position={Position.Right}
        className="handle-mesh"
      />
    </div>
  );
}
