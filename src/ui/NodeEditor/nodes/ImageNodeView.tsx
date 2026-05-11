import { Handle, Position, type NodeProps } from '@xyflow/react';

export function ImageNodeView({ id }: NodeProps) {
  return (
    <div className="node-card">
      <div className="node-card__header node-card__header--image">Image</div>
      <div className="node-card__body">
        <div className="node-card__placeholder">No image</div>
        <div className="node-card__meta">{id}</div>
      </div>
      <Handle
        id="texture"
        type="source"
        position={Position.Right}
        className="handle-texture"
      />
    </div>
  );
}
