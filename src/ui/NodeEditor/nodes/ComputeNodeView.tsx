import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useMemo } from "react";
import type { ComputeGraphNode } from "../../../core/graph/types";
import { NODE_META } from "../../../core/nodes/registry";

export function ComputeNodeView({ data }: NodeProps) {
  const node = data.node as ComputeGraphNode;

  const inputs = useMemo(() => NODE_META.compute.inputs(node), [node]);

  const headerH = 24;
  const stride = 18;
  const topPad = headerH + 8;

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 140 }}>
      <div className="node-card__header node-card__header--shader">
        Compute · {node.primitive}
      </div>
      <div
        className="node-card__body"
        style={{ paddingLeft: 14, paddingRight: 14 }}
      >
        <div className="node-card__meta" style={{ fontSize: 10 }}>
          {node.count.toLocaleString()} verts · {node.attributes.length} attr
        </div>
      </div>
      {inputs.map((p, i) => (
        <Handle
          key={p.name}
          id={p.name}
          type="target"
          position={Position.Left}
          className={`handle-${p.type}`}
          style={{ top: topPad + i * stride }}
        />
      ))}
      <Handle
        id="mesh"
        type="source"
        position={Position.Right}
        className="handle-mesh"
        style={{ top: topPad }}
      />
    </div>
  );
}
