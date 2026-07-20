import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { diagnosticsMetricValues } from "./diagnosticsTab";

/**
 * 진단 오버레이 전용 단일 행 메트릭 스트립 (S7 · T3/T4,
 * design/App Shell.dc.html L419-424). 값은 diagnosticsMetricValues로
 * 2×2 카드와 단일 출처. 별도 컴포넌트인 이유: stats 틱 구독 리렌더를
 * 스트립에 격리 (StatusOverlays 전체 리렌더 방지).
 * dc 값 표기와의 의도적 차이(GPU=renderer 문자열, Frame=ms·fps 병기)는
 * temp/design-followup-v2.0.md 기록 — 값 소스는 카드와 동일(S7 지시).
 */
export function DiagnosticsMetricStrip() {
  const glInfo = useRendererStore((s) => s.glInfo);
  const stats = useRendererStore((s) => s.stats);
  const nodes = useGraphStore((s) => s.nodes);
  const byNode = useDiagnosticsStore((s) => s.byNode);
  const mv = diagnosticsMetricValues({
    glInfo,
    fps: stats.fps,
    drawCalls: stats.drawCalls,
    nodes,
    byNode,
  });

  return (
    <div
      data-testid="diagnostics-metric-strip"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: 26,
        flexShrink: 0,
        padding: "0 12px",
        borderBottom: "1px solid var(--border-header-divider)",
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        color: "var(--text-secondary)",
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>GPU </span>
        {mv.gpu}
      </span>
      <span style={{ flexShrink: 0 }}>
        <span style={{ color: "var(--text-muted)" }}>Frame </span>
        {mv.frame}
      </span>
      <span style={{ flexShrink: 0 }}>
        <span style={{ color: "var(--text-muted)" }}>Draws </span>
        {mv.draws}
      </span>
      <span style={{ flexShrink: 0 }}>
        <span style={{ color: "var(--text-muted)" }}>Shaders </span>
        {mv.shaders}
      </span>
    </div>
  );
}
