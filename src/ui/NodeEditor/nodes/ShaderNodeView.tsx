import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import type { ShaderGraphNode } from "../../../core/graph/types";
import { displayNodeName, NODE_META } from "../../../core/nodes/registry";
import { useDiagnosticsStore } from "../../../state/diagnosticsStore";
import { NodeThumbnail } from "../NodeThumbnail";
import { countNodeDiagnostics, ErrorBadge } from "./ErrorBadge";
import { GpuTimerChip } from "./GpuTimerChip";
import { NodeCardHeader } from "./NodeCardHeader";
import {
  multiPortPreviewH,
  PORT_STRIDE_MULTI,
  PORT_TOP_PAD,
  PortHandle,
} from "./PortHandle";

export function ShaderNodeView({ id, data }: NodeProps) {
  const node = data.node as ShaderGraphNode;
  const errorCount = useDiagnosticsStore((s) =>
    countNodeDiagnostics(s.byNode[id]),
  );

  const inputs = useMemo(
    () => NODE_META.shader.inputs(node),
    [node.vertexSource, node.fragmentSource, node],
  );

  return (
    <div
      className={`node-card${errorCount > 0 ? " node-card--error" : ""}`}
      style={{ position: "relative", minWidth: 196 }}
    >
      <NodeCardHeader
        kind="shader"
        title={displayNodeName(node)}
        nodeId={id}
        {...(errorCount > 0 ? { tone: "error" as const } : {})}
        meta={
          errorCount > 0 ? (
            <ErrorBadge nodeId={id} />
          ) : (
            <GpuTimerChip nodeId={id} />
          )
        }
      />
      <div className="node-card__body" style={{ padding: "9px 0" }}>
        {/* Thumbnail insets by the 46px port rail on both sides so the live
         * preview never overlaps the rail labels (design/Node Editor.dc.html
         * L188: `margin:0 46px;height:96px`). Height follows the input-port
         * span once a shader declares enough uniforms to outgrow the 96px
         * default — dc's 6-port 'Noise' card is the reference [C-3]. */}
        <div style={{ margin: "0 46px" }}>
          <NodeThumbnail
            nodeId={id}
            width="100%"
            height={multiPortPreviewH(inputs.length)}
          />
        </div>
      </div>
      {inputs.map((p, i) => (
        <PortHandle
          key={p.name}
          port={p}
          side="in"
          top={PORT_TOP_PAD + i * PORT_STRIDE_MULTI}
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
