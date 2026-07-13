import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import type { ShaderGraphNode } from "../../../core/graph/types";
import { NODE_META } from "../../../core/nodes/registry";
import { useDiagnosticsStore } from "../../../state/diagnosticsStore";
import { NodeThumbnail } from "../NodeThumbnail";
import { countNodeDiagnostics, ErrorBadge } from "./ErrorBadge";
import { GpuTimerChip } from "./GpuTimerChip";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_STRIDE, PORT_TOP_PAD, PortHandle } from "./PortHandle";

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
      style={{ position: "relative", minWidth: 180 }}
    >
      <NodeCardHeader
        kind="shader"
        title="Shader"
        {...(errorCount > 0 ? { tone: "error" as const } : {})}
        meta={
          errorCount > 0 ? (
            <ErrorBadge nodeId={id} />
          ) : (
            <GpuTimerChip nodeId={id} />
          )
        }
      />
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
