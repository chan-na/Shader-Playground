import { useEffect, useState } from "react";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { useTimeStore } from "../../state/timeStore";
import { tokens, withAlpha } from "../../theme";

/** Ready-dot glow (App Shell.dc.html L402: box-shadow:0 0 6px #34d399). */
const READY_DOT_GLOW = `0 0 6px ${withAlpha(tokens.semantic.success, 1)}`;

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
  const nodeCount = useGraphStore((s) => s.nodes.length);
  const edgeCount = useGraphStore((s) => s.edges.length);
  const gpuSupported = useGpuTimerStore((s) => s.supported);
  const gpuEnabled = useGpuTimerStore((s) => s.enabled);
  const gpuTotalMs = useGpuTimerStore((s) => s.totalMs);
  const diagOpen = useDebugUiStore((s) => s.open);
  const toggleDiag = useDebugUiStore((s) => s.toggleOpen);

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

  return (
    <div className="statusbar-row">
      <span
        className="statusbar-status"
        style={{ color: ready ? "var(--success)" : "var(--text-muted)" }}
      >
        <span
          className="statusbar-dot"
          aria-hidden="true"
          style={
            ready
              ? { background: "var(--success)", boxShadow: READY_DOT_GLOW }
              : { background: "var(--text-muted)" }
          }
        />
        {ready ? "GL ready" : "GL init"}
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
        onClick={toggleDiag}
        title="Toggle the developer diagnostics panel"
        data-testid="open-diagnostics"
        aria-pressed={diagOpen}
      >
        Diagnostics
      </button>
    </div>
  );
}
