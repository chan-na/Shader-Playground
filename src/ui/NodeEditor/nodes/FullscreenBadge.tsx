import { usePassPlanStore } from "../../../state/passPlanStore";

/**
 * Node-card header badge (selectors/style follow the ErrorBadge/GpuTimerChip
 * precedent) marking a shader node whose mesh input didn't resolve, so the
 * compiler substituted fullscreen.vert for its vertex stage (A-1). Reads
 * `passPlanStore.fullscreenByNode` — the same per-node record the Code
 * editor's auto-vertex label/readOnly mode reads (`CodeEditor/index.tsx`),
 * so the badge and the tab can never disagree about which nodes are auto.
 *
 * Renders alongside (not instead of) the error/timer meta slot — a node can
 * be both fullscreen *and* broken, or fullscreen and fine, and both facts
 * are independently true (see ShaderNodeView's meta composition).
 */
export function FullscreenBadge({ nodeId }: { nodeId: string }) {
  const isFullscreen = usePassPlanStore(
    (s) => s.fullscreenByNode[nodeId] === true,
  );
  if (!isFullscreen) return null;
  return (
    <div
      data-testid={`node-fullscreen-${nodeId}`}
      // Cause-NEUTRAL wording ("해석되지 않아", not "없어"): fullscreenByNode
      // is true not only when the mesh edge is absent but also when the edge
      // exists and doesn't resolve — mesh asset not loaded, or the driving
      // compute pass failed to build (compile.ts meshIsFullscreen). Claiming
      // "no mesh input" while an edge is visibly connected would point a
      // learner away from the real cause (e.g. a compute compile error).
      title="mesh 입력이 해석되지 않아 fullscreen.vert로 컴파일됨 — vertex 탭 참조"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8.5,
        color: "var(--text-muted)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-card)",
        // Inspector's AUTO badge (Panels/Inspector.tsx ~L381) uses the same
        // 4px one-off literal — design/Side Panel.dc.html L79's radius has
        // no matching tokens.radius entry.
        borderRadius: 4,
        padding: "1px 5px",
      }}
    >
      FULLSCREEN
    </div>
  );
}
