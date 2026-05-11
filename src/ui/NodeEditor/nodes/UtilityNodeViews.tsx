import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  combineInputPorts,
  combineOutputPort,
  mathInputPorts,
  swizzleOutputPort,
} from '../../../core/nodes/registry';
import type {
  CombineGraphNode,
  MathGraphNode,
  SwizzleGraphNode,
} from '../../../core/graph/types';
import { isValidSwizzleMask } from '../../../core/nodes/utility';

const HANDLE_SPACING = 16;

export function MathNodeView({ id, data }: NodeProps) {
  const node = data.node as MathGraphNode;
  const inputs = mathInputPorts(node.op);

  return (
    <div className="node-card" style={{ minWidth: 132 }}>
      <div className="node-card__header node-card__header--param">Math · {node.op}</div>
      <div className="node-card__body">
        <div className="node-card__param-value">
          {inputs.map((p) => `${p.name}=${valueFor(node, p.name)}`).join('  ')}
        </div>
        <div className="node-card__meta">{id}</div>
      </div>
      {inputs.map((p, i) => (
        <Handle
          key={p.name}
          id={p.name}
          type="target"
          position={Position.Left}
          className={`handle-${p.type}`}
          style={{ top: 28 + i * HANDLE_SPACING }}
        />
      ))}
      <Handle id="value" type="source" position={Position.Right} className="handle-float" />
    </div>
  );
}

function valueFor(node: MathGraphNode, name: string): string {
  if (name === 'a') return node.a.toFixed(2);
  if (name === 'b') return node.b.toFixed(2);
  return '';
}

export function SwizzleNodeView({ id, data }: NodeProps) {
  const node = data.node as SwizzleGraphNode;
  const out = swizzleOutputPort(node.mask);
  const valid = isValidSwizzleMask(node.mask);
  return (
    <div className="node-card" style={{ minWidth: 132 }}>
      <div className="node-card__header node-card__header--param">
        Swizzle · .{node.mask}
      </div>
      <div className="node-card__body">
        <div className="node-card__param-value">
          {valid ? `→ ${out.type}` : 'invalid mask'}
        </div>
        <div className="node-card__meta">{id}</div>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="handle-vec4" />
      <Handle id="value" type="source" position={Position.Right} className={`handle-${out.type}`} />
    </div>
  );
}

export function CombineNodeView({ id, data }: NodeProps) {
  const node = data.node as CombineGraphNode;
  const inputs = combineInputPorts(node.arity);
  const out = combineOutputPort(node.arity);
  return (
    <div className="node-card" style={{ minWidth: 132 }}>
      <div className="node-card__header node-card__header--param">
        Combine · {out.type}
      </div>
      <div className="node-card__body">
        <div className="node-card__param-value">
          {inputs.map((p, i) => `${p.name}=${node.values[i].toFixed(2)}`).join(' ')}
        </div>
        <div className="node-card__meta">{id}</div>
      </div>
      {inputs.map((p, i) => (
        <Handle
          key={p.name}
          id={p.name}
          type="target"
          position={Position.Left}
          className={`handle-${p.type}`}
          style={{ top: 28 + i * HANDLE_SPACING }}
        />
      ))}
      <Handle id="value" type="source" position={Position.Right} className={`handle-${out.type}`} />
    </div>
  );
}
