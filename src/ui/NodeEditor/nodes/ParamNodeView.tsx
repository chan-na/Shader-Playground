import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTimeStore } from '../../../state/timeStore';
import { paramOutputPort } from '../../../core/nodes/registry';
import type { ParamGraphNode } from '../../../core/graph/types';

function formatValue(node: ParamGraphNode, time: number): string {
  if (node.paramKind === 'time') {
    const [scale = 1, offset = 0] = Array.isArray(node.value)
      ? node.value
      : [node.value as number, 0];
    const t = time * scale + offset;
    return `${t.toFixed(2)} (×${scale}+${offset})`;
  }
  const v = node.value;
  if (Array.isArray(v)) return v.map((x) => x.toFixed(2)).join(', ');
  return (v as number).toFixed(3);
}

function colorSwatch(rgb: number[]): string {
  const c = (x: number) =>
    Math.round(Math.max(0, Math.min(1, x)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb[0] ?? 0)}${c(rgb[1] ?? 0)}${c(rgb[2] ?? 0)}`;
}

export function ParamNodeView({ id, data }: NodeProps) {
  const node = data.node as ParamGraphNode;
  const time = useTimeStore((s) => s.simTime);
  const port = paramOutputPort(node.paramKind);

  return (
    <div className="node-card" style={{ minWidth: 132 }}>
      <div className="node-card__header node-card__header--param">
        {node.label ? `${node.label}` : `Param · ${node.paramKind}`}
      </div>
      <div className="node-card__body">
        {node.paramKind === 'color' && Array.isArray(node.value) ? (
          <div
            className="node-card__param-swatch"
            style={{ background: colorSwatch(node.value) }}
          />
        ) : (
          <div className="node-card__param-value">{formatValue(node, time)}</div>
        )}
        <div className="node-card__meta">{id}</div>
      </div>
      <Handle
        id={port.name}
        type="source"
        position={Position.Right}
        className={`handle-${port.type}`}
      />
    </div>
  );
}
