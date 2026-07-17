import { useEffect, useState } from "react";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useGraphStore } from "../../state/graphStore";
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
  // R5: shader diagnostics count across all severities (not just errors) —
  // mirrors the former SidePanel Problems badge total (SidePanel.tsx
  // problemCount selector, pre-B5-U3). Combined with runtime errors below
  // into the status-problems count. Distinct from compileErrorCount above
  // (errors only, feeds statusSummary) — left untouched per B5-U3 scope.
  const diagnosticsProblemCount = useDiagnosticsStore((s) => {
    let n = 0;
    for (const d of Object.values(s.byNode)) {
      n += d.vertex.length + d.fragment.length + d.link.length;
    }
    return n;
  });
  const gpuSupported = useGpuTimerStore((s) => s.supported);
  const gpuEnabled = useGpuTimerStore((s) => s.enabled);
  const gpuTotalMs = useGpuTimerStore((s) => s.totalMs);
  const diagOpen = useDebugUiStore((s) => s.open);
  const toggleDiag = useDebugUiStore((s) => s.toggleOpen);
  const toggleProblems = useDebugUiStore((s) => s.toggleProblems);
  // R5 (B5-U3): diagnostics is no longer a Side Panel tab — it's a bottom
  // transient overlay (StatusOverlays) toggled purely by debugUiStore.open.
  // The D1-era un-collapse dance (finding the inspector/assets dock leaf and
  // force-expanding it so the *tab* would be visible) no longer applies: the
  // overlay renders outside the dock tree entirely, so there's nothing to
  // un-collapse. toggleDiag is wired directly; StatusBar no longer imports
  // dockStore/dockTree at all.

  // Sampled, not subscribed — see TIME_SAMPLE_INTERVAL_MS above.
  const [simTime, setSimTime] = useState(() => useTimeStore.getState().simTime);
  useEffect(() => {
    const id = setInterval(() => {
      setSimTime(useTimeStore.getState().simTime);
    }, TIME_SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const errorCount = stats.errors.length;
  const problemCount = diagnosticsProblemCount + errorCount;
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
      <button
        type="button"
        className={
          problemCount > 0
            ? "statusbar-problems"
            : "statusbar-problems statusbar-muted"
        }
        onClick={toggleProblems}
        title={
          errorCount > 0 ? stats.errors.join("\n") : "Open the problems list"
        }
        data-testid="status-problems"
      >
        {problemCount > 0
          ? `⚠ ${problemCount} problem${problemCount === 1 ? "" : "s"}`
          : "no problems"}
      </button>
      <button
        type="button"
        className="statusbar-diag"
        onClick={toggleDiag}
        title="Toggle the developer diagnostics panel"
        data-testid="open-diagnostics"
        aria-pressed={diagOpen}
      >
        ◨ Diagnostics
      </button>
    </div>
  );
}
