import { useEffect, useState } from "react";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useGraphStore } from "../../state/graphStore";
import { useLayoutStore } from "../../state/layoutStore";
import { useRendererStore } from "../../state/rendererStore";
import { useTimeStore } from "../../state/timeStore";
import { tokens, withAlpha } from "../../theme";
import { type StatusTone, statusSummary } from "./statusSummary";

/** Left status pill text color per tone (App Shell.dc.html L402 pattern). */
const TONE_COLOR: Record<StatusTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--error)",
  muted: "var(--text-muted)",
};

/**
 * Status dot glow per tone (App Shell.dc.html L402: box-shadow:0 0 6px
 * #34d399 for the ready/success case). `muted` has no dc glow reference —
 * the pre-init dot stays flat.
 */
const TONE_DOT_GLOW: Partial<Record<StatusTone, string>> = {
  success: `0 0 6px ${withAlpha(tokens.semantic.success, 1)}`,
  warning: `0 0 6px ${withAlpha(tokens.semantic.warning, 1)}`,
  error: `0 0 6px ${withAlpha(tokens.semantic.error, 1)}`,
};

/**
 * u_time sampling interval (ms). The RAF loop advances useTimeStore's
 * simTime up to 60x/sec — subscribing to it directly would re-render this
 * whole bar every frame. Polling on an interval instead keeps the bar idle
 * between samples while still reading a fresh value while paused (a scrub
 * lands within one interval tick).
 */
const TIME_SAMPLE_INTERVAL_MS = 250;

export function StatusBar() {
  const stats = useRendererStore((s) => s.stats);
  const ready = useRendererStore((s) => s.ready);
  const paneCount = useRendererStore((s) => s.panes.length);
  const contextUnavailable = useRendererStore((s) => s.contextUnavailable);
  const nodeCount = useGraphStore((s) => s.nodes.length);
  const edgeCount = useGraphStore((s) => s.edges.length);
  const compileErrorCount = useDiagnosticsStore((s) => {
    let n = 0;
    for (const d of Object.values(s.byNode)) {
      for (const arr of [d.vertex, d.fragment, d.link]) {
        for (const x of arr) if (x.severity === "error") n++;
      }
    }
    return n;
  });
  const gpuSupported = useGpuTimerStore((s) => s.supported);
  const gpuEnabled = useGpuTimerStore((s) => s.enabled);
  const gpuTotalMs = useGpuTimerStore((s) => s.totalMs);
  const diagOpen = useDebugUiStore((s) => s.open);
  const toggleDiag = useDebugUiStore((s) => s.toggleOpen);
  // D1: Diagnostics는 이제 Side Panel의 4번째 탭이다 — side panel이 접혀
  // 있으면 open을 true로 만들어도 탭 본문이 보이지 않는다. 진입 경로의
  // 가시성을 보장하기 위해 열 때는 접힘도 함께 풀어준다(닫을 때는 건드리지
  // 않음 — 사용자가 의도적으로 접었을 수 있으므로).
  const sidePanelCollapsed = useLayoutStore((s) => s.collapsed.sidePanel);
  const toggleCollapsed = useLayoutStore((s) => s.toggleCollapsed);
  const handleDiagClick = () => {
    if (!diagOpen && sidePanelCollapsed) toggleCollapsed("sidePanel");
    toggleDiag();
  };

  // Sampled, not subscribed — see TIME_SAMPLE_INTERVAL_MS above.
  const [simTime, setSimTime] = useState(() => useTimeStore.getState().simTime);
  useEffect(() => {
    const id = setInterval(() => {
      setSimTime(useTimeStore.getState().simTime);
    }, TIME_SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const errorCount = stats.errors.length;
  const showGpu = gpuSupported && gpuEnabled;

  const summary = statusSummary({
    ready,
    contextUnavailable,
    nodeCount,
    paneCount,
    compileErrorCount,
  });
  const toneColor = TONE_COLOR[summary.tone];
  const dotGlow = TONE_DOT_GLOW[summary.tone];

  return (
    <div className="statusbar-row">
      <span
        className="statusbar-status"
        style={{ color: toneColor }}
        data-testid="status-pill"
      >
        <span
          className="statusbar-dot"
          aria-hidden="true"
          style={
            dotGlow
              ? { background: toneColor, boxShadow: dotGlow }
              : { background: toneColor }
          }
        />
        {summary.text}
      </span>
      <span title="Frames per second">{stats.fps} FPS</span>
      <span title="Draw calls per frame">{stats.drawCalls} draws</span>
      {showGpu ? (
        <span
          title="Sum of GPU pass times (EXT_disjoint_timer_query_webgl2, EMA-smoothed)"
          data-testid="status-gpu-ms"
        >
          {gpuTotalMs.toFixed(2)}ms GPU
        </span>
      ) : null}
      <span
        className="statusbar-muted"
        title="Total nodes / edges in the graph"
      >
        {nodeCount}N · {edgeCount}E
      </span>
      <span title="u_time (simulated shader time)">
        t {simTime.toFixed(2)}s
      </span>
      <div className="statusbar-spacer" />
      {errorCount > 0 ? (
        <span className="statusbar-error" title={stats.errors.join("\n")}>
          ⚠ {errorCount} error{errorCount === 1 ? "" : "s"}
        </span>
      ) : (
        <span className="statusbar-muted">no errors</span>
      )}
      <button
        type="button"
        className="statusbar-diag"
        onClick={handleDiagClick}
        title="Toggle the developer diagnostics panel"
        data-testid="open-diagnostics"
        aria-pressed={diagOpen}
      >
        Diagnostics
      </button>
    </div>
  );
}
