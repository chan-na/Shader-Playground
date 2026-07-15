import type { GraphNode } from "../../core/graph/types";
import { displayNodeName } from "../../core/nodes/registry";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { tokens, withAlpha } from "../../theme";
import {
  categoryHexFor,
  NODE_CATEGORY_OF,
  NODE_GLYPH,
} from "../NodeEditor/nodeTheme";

export interface InspectorNodeHeaderProps {
  node: GraphNode;
}

/**
 * Common Inspector header shared by every node kind (design/Side Panel.dc.html
 * L60-72): icon box + title, category/kind meta line, and a chip row (GPU ms
 * + kind). The design also shows an 84×84 render thumbnail to the left of the
 * title — deliberately omitted here: `ThumbnailScheduler` (see
 * design-refactor notes §4) only supports a single subscriber per node, and
 * the node card already scrolled into the graph view owns that slot. A second
 * subscriber for the same node in the Inspector would starve one of the two
 * of readbacks, so the Inspector stays text-only.
 */
export function InspectorNodeHeader({ node }: InspectorNodeHeaderProps) {
  const supported = useGpuTimerStore((s) => s.supported);
  const enabled = useGpuTimerStore((s) => s.enabled);
  const ms = useGpuTimerStore((s) => s.byNode[node.id]);

  const cat = categoryHexFor(node.kind);
  const title = displayNodeName(node);

  // No node.id here [D15] — the internal id is an implementation detail,
  // not a user-facing label. `insp-gpu-ms-${node.id}` below is a
  // data-testid (a test hook), not display text, so it's unaffected.
  let meta = `${NODE_CATEGORY_OF[node.kind]} · ${node.kind}`;
  if (node.kind === "mesh") meta += ` · primitive ${node.primitive}`;
  if (node.kind === "param") meta += ` · kind ${node.paramKind}`;

  return (
    <div
      style={{
        padding: 14,
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 5,
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            borderRadius: "var(--radius-icon-box)",
            background: withAlpha(cat, 0.2),
            border: `1px solid ${cat}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: cat,
          }}
        >
          {NODE_GLYPH[node.kind]}
        </span>
        <span
          data-testid="insp-node-title"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          marginBottom: 9,
        }}
      >
        {meta}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {supported && enabled && ms !== undefined && (
          <span
            data-testid={`insp-gpu-ms-${node.id}`}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--success)",
              background: withAlpha(tokens.semantic.success, 0.12),
              border: `1px solid ${withAlpha(tokens.semantic.success, 0.3)}`,
              borderRadius: tokens.radius.iconBox,
              padding: "2px 7px",
            }}
          >
            {ms.toFixed(2)} ms
          </span>
        )}
        <span
          data-testid="insp-node-kind-chip"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-secondary)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: tokens.radius.iconBox,
            padding: "2px 7px",
          }}
        >
          {node.kind}
        </span>
      </div>
    </div>
  );
}
