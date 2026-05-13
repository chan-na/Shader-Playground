import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { ParamGraphNode } from "../../../core/graph/types";
import { paramOutputPort } from "../../../core/nodes/registry";
import { useTimeStore } from "../../../state/timeStore";
import { colorSwatchHex, formatParamValue } from "./paramNodeViewHelpers";

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
        {node.paramKind === "color" && Array.isArray(node.value) ? (
          <div
            className="node-card__param-swatch"
            style={{ background: colorSwatchHex(node.value) }}
          />
        ) : (
          <div className="node-card__param-value">
            {formatParamValue(node, time)}
          </div>
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
