import {
  type NodeDiagnostics,
  useDiagnosticsStore,
} from "../../../state/diagnosticsStore";

/**
 * vertex + fragment + link diagnostics counted as one number — the badge
 * doesn't distinguish stage, only "is this node broken and by how much"
 * (design/Node Editor.dc.html L201's "✕ 2"). `undefined` (no diagnostics ever
 * recorded for this node) counts as 0.
 */
export function countNodeDiagnostics(nd: NodeDiagnostics | undefined): number {
  if (nd === undefined) return 0;
  return nd.vertex.length + nd.fragment.length + nd.link.length;
}

/**
 * Header meta-slot replacement for `GpuTimerChip` when a shader/compute node
 * has compile diagnostics — design/Node Editor.dc.html L197-212 (Blend,
 * ERROR state): a small red "✕ N" pill instead of the ms timer. Renders
 * nothing while the node has zero diagnostics so the header falls back to
 * the timer chip (see ShaderNodeView/ComputeNodeView).
 */
export function ErrorBadge({ nodeId }: { nodeId: string }) {
  const count = useDiagnosticsStore((s) =>
    countNodeDiagnostics(s.byNode[nodeId]),
  );
  if (count === 0) return null;
  return (
    <div
      className="node-card__error-badge"
      data-testid={`node-errors-${nodeId}`}
      title={`${count} diagnostic${count === 1 ? "" : "s"}`}
    >
      {`✕ ${count}`}
    </div>
  );
}
