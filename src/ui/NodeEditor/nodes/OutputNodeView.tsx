import { Handle, Position } from '@xyflow/react';

export function OutputNodeView() {
  return (
    <div className="node-card" style={{ minWidth: 100 }}>
      <div className="node-card__header node-card__header--output">Output</div>
      <div className="node-card__body" style={{ paddingLeft: 14 }}>
        <div className="node-card__meta">→ Canvas</div>
      </div>
      <Handle
        id="texture"
        type="target"
        position={Position.Left}
        className="handle-texture"
      />
    </div>
  );
}
