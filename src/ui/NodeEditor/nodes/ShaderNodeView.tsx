import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import type { ShaderGraphNode } from "../../../core/graph/types";
import { NODE_META } from "../../../core/nodes/registry";
import { NodeThumbnail } from "../NodeThumbnail";
import { PORT_STRIDE, PORT_TOP_PAD, PortHandle } from "./PortHandle";

export function ShaderNodeView({ id, data }: NodeProps) {
  const node = data.node as ShaderGraphNode;

  const inputs = useMemo(
    () => NODE_META.shader.inputs(node),
    [node.vertexSource, node.fragmentSource, node],
  );

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 180 }}>
      <div className="node-card__header node-card__header--shader">Shader</div>
      <div
        className="node-card__body"
        style={{ paddingLeft: 22, paddingRight: 22 }}
      >
        <NodeThumbnail nodeId={id} />
        <div className="node-card__meta">{id}</div>
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
        port={{ name: "texture", type: "texture" }}
        side="out"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}
