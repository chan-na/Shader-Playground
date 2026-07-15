import type { NodeProps } from "@xyflow/react";
import type { GraphNode } from "../../../core/graph/types";
import { displayNodeName } from "../../../core/nodes/registry";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

export function OutputNodeView({ id, data }: NodeProps) {
  const node = data.node as GraphNode;
  return (
    <div className="node-card" style={{ position: "relative", minWidth: 132 }}>
      <NodeCardHeader kind="output" title={displayNodeName(node)} nodeId={id} />
      <div className="node-card__body" style={{ paddingLeft: 22 }}>
        <div className="node-card__meta">→ Canvas</div>
      </div>
      <PortHandle
        port={{ name: "texture", type: "texture" }}
        side="in"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}
