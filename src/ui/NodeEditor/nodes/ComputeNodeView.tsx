import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import type { ComputeGraphNode } from "../../../core/graph/types";
import { NODE_META } from "../../../core/nodes/registry";
import { PORT_STRIDE, PORT_TOP_PAD, PortHandle } from "./PortHandle";

export function ComputeNodeView({ data }: NodeProps) {
  const node = data.node as ComputeGraphNode;

  const inputs = useMemo(() => NODE_META.compute.inputs(node), [node]);

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 184 }}>
      <div className="node-card__header node-card__header--compute">
        Compute · {node.primitive}
      </div>
      <div
        className="node-card__body"
        style={{ paddingLeft: 22, paddingRight: 22 }}
      >
        <div className="node-card__meta" style={{ fontSize: 10 }}>
          {node.count.toLocaleString()} verts · {node.attributes.length} attr
        </div>
      </div>
      {inputs.map((p, i) => (
        <PortHandle
          key={p.name}
          port={p}
          side="in"
          top={PORT_TOP_PAD + i * PORT_STRIDE}
        />
      ))}
      <PortHandle
        port={{ name: "mesh", type: "mesh" }}
        side="out"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}
