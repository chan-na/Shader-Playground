import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import type { ComputeGraphNode } from "../../../core/graph/types";
import { displayNodeName, NODE_META } from "../../../core/nodes/registry";
import { useDiagnosticsStore } from "../../../state/diagnosticsStore";
import { countNodeDiagnostics, ErrorBadge } from "./ErrorBadge";
import { GpuTimerChip } from "./GpuTimerChip";
import { NodeCardHeader } from "./NodeCardHeader";
import {
  multiPortBodyMinH,
  PORT_STRIDE_MULTI,
  PORT_TOP_PAD,
  PortHandle,
} from "./PortHandle";
import { usePortInternals } from "./usePortInternals";

/** label mono 10px muted / value mono 11px primary, space-between — mirrors
 * design/Node Editor.dc.html L221-225's particles/dispatch/buffer rows. */
function ComputeKvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="node-card__kv-row">
      <span className="node-card__kv-label">{label}</span>
      <span className="node-card__kv-value">{value}</span>
    </div>
  );
}

export function ComputeNodeView({ id, data }: NodeProps) {
  const node = data.node as ComputeGraphNode;
  const errorCount = useDiagnosticsStore((s) =>
    countNodeDiagnostics(s.byNode[id]),
  );

  const inputs = useMemo(() => NODE_META.compute.inputs(node), [node]);
  // Editing the compute source adds/removes/reorders input ports; tell React
  // Flow so the new handles become connectable.
  usePortInternals(id, inputs);

  return (
    <div
      className={`node-card${errorCount > 0 ? " node-card--error" : ""}`}
      style={{ position: "relative", minWidth: 184 }}
    >
      <NodeCardHeader
        kind="compute"
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
      <div
        className="node-card__body"
        style={{
          paddingLeft: 22,
          paddingRight: 22,
          // Compute grows one input port per non-sampler uniform just like
          // Shader does, but its body is a fixed 3-row kv list with no
          // thumbnail to expand — so the port span sets a floor instead [C-3].
          // This expansion rule (no 96 floor) was a provisional call at
          // v1.2 (no dc coverage yet) — CHANGELOG §v1.3 Q8 now canonically
          // approves it.
          minHeight: multiPortBodyMinH(inputs.length),
        }}
      >
        <div className="node-card__kv-list">
          <ComputeKvRow label="primitive" value={node.primitive} />
          <ComputeKvRow label="verts" value={node.count.toLocaleString()} />
          <ComputeKvRow
            label="attrs"
            value={node.attributes.length.toString()}
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
        port={{ name: "mesh", type: "mesh" }}
        side="out"
        top={PORT_TOP_PAD}
        tooltip="mesh (TF ping-pong buffer) — compute out 어트리뷰트가 실체. 정적 메시가 아니라 매 프레임 갱신되는 버퍼입니다"
      />
    </div>
  );
}
