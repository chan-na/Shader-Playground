import type { NodeProps } from "@xyflow/react";
import type { GraphNode } from "../../../core/graph/types";
import { displayNodeName } from "../../../core/nodes/registry";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

export function OutputNodeView({ id, data }: NodeProps) {
  const node = data.node as GraphNode;
  return (
    <div className="node-card" style={{ position: "relative", minWidth: 150 }}>
      <NodeCardHeader kind="output" title={displayNodeName(node)} nodeId={id} />
      {/* design/Node Editor.dc.html L264 uses `→ viewport A`, but the pane
       * letter isn't known here — the card has no pane assignment, only the
       * graph does (followup: temp/design-followup-v1.1.md). paddingLeft is
       * 46 (the full rail width) rather than dc's 34: our rail label is the
       * raw port name `texture` (not the shortened `tex` dc uses), and at
       * max-width 34px/left 11px that clears to x45 — 34 would clip into
       * this meta text, so 46 keeps the two clear of each other. */}
      <div className="node-card__body" style={{ paddingLeft: 46 }}>
        <div className="node-card__meta">→ viewport</div>
      </div>
      <PortHandle
        port={{ name: "texture", type: "texture" }}
        side="in"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}
