import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useMemo } from "react";
import type { ComputeGraphNode } from "../../../core/graph/types";
import { NODE_META } from "../../../core/nodes/registry";
import { PortHandle } from "./PortHandle";

export function ComputeNodeView({ data }: NodeProps) {
  const node = data.node as ComputeGraphNode;

  const inputs = useMemo(() => NODE_META.compute.inputs(node), [node]);

  const headerH = 24;
  const stride = 18;
  const topPad = headerH + 8;

  // Labels only when the node exposes 2+ ports; with zero uniform inputs the
  // card is effectively single-port and the header alone is enough.
  const labeled = inputs.length >= 1;
  const sidePad = labeled ? 22 : 14;

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 168 }}>
      <div className="node-card__header node-card__header--shader">
        Compute · {node.primitive}
      </div>
      <div
        className="node-card__body"
        style={{ paddingLeft: sidePad, paddingRight: sidePad }}
      >
        <div className="node-card__meta" style={{ fontSize: 10 }}>
          {node.count.toLocaleString()} verts · {node.attributes.length} attr
        </div>
      </div>
      {labeled ? (
        <>
          {inputs.map((p, i) => (
            <PortHandle
              key={p.name}
              port={p}
              side="in"
              top={topPad + i * stride}
            />
          ))}
          <PortHandle
            port={{ name: "mesh", type: "mesh" }}
            side="out"
            top={topPad}
          />
        </>
      ) : (
        <Handle
          id="mesh"
          type="source"
          position={Position.Right}
          className="handle-mesh"
          style={{ top: topPad }}
        />
      )}
    </div>
  );
}
