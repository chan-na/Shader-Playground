import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useMemo } from "react";
import type { ShaderGraphNode } from "../../../core/graph/types";
import { NODE_META } from "../../../core/nodes/registry";
import { NodeThumbnail } from "../NodeThumbnail";

export function ShaderNodeView({ id, data }: NodeProps) {
  const node = data.node as ShaderGraphNode;

  const inputs = useMemo(
    () => NODE_META.shader.inputs(node),
    [node.vertexSource, node.fragmentSource, node],
  );

  // Vertical stride per input handle
  const headerH = 24;
  const stride = 18;
  const topPad = headerH + 8;

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 132 }}>
      <div className="node-card__header node-card__header--shader">Shader</div>
      <div
        className="node-card__body"
        style={{ paddingLeft: 14, paddingRight: 14 }}
      >
        <NodeThumbnail nodeId={id} />
        <div className="node-card__meta">{id}</div>
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
        id="texture"
        type="source"
        position={Position.Right}
        className="handle-texture"
        style={{ top: topPad }}
      />
    </div>
  );
}
