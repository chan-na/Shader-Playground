/**
 * Pure helpers backing the diagnostics metric values + runtime log
 * (design/App Shell.dc.html "DIAGNOSTICS / PROBLEMS OVERLAY"). The
 * metric-value helpers' sole consumer is the overlay's
 * DiagnosticsMetricStrip; the runtime-log helper (relativeLogTime) is
 * consumed by DiagnosticsPanel.
 * Kept separate from those components so the value-formatting logic has a
 * unit-testable surface independent of store wiring / DOM.
 */

import type { GraphNode } from "../../core/graph/types";
import type { NodeDiagnostics } from "../../state/diagnosticsStore";
import type { GlInfo } from "../../state/rendererStore";

/** "Frame" metric value: `<ms> ms · <fps> fps`, or "—" when idle. */
export function frameMetricValue(fps: number): string {
  return fps > 0 ? `${(1000 / fps).toFixed(1)} ms · ${fps} fps` : "—";
}

/**
 * "Shaders" metric value: `<n> compiled` (dc "Shaders 3 compiled").
 *
 * There is no GL program cache in any store to count directly, so this is a
 * graph-shape proxy: the count is the number of shader/compute nodes, and one
 * counts as compiled when its node has no severity==="error" diagnostic across
 * vertex/fragment/link (a node with only warnings, or no diagnostics at all,
 * still counts).
 *
 * The label says "compiled", not "linked": this proxy can't provide a real GL
 * link count, and exposing a new GL-layer program counter was out of scope.
 * A true linked-program count remains future work.
 */
export function linkedProgramsValue(
  nodes: readonly GraphNode[],
  byNode: Record<string, NodeDiagnostics>,
): string {
  const programNodes = nodes.filter(
    (n) => n.kind === "shader" || n.kind === "compute",
  );
  const linked = programNodes.filter((n) => {
    const diags = byNode[n.id];
    if (!diags) return true;
    const hasError = [...diags.vertex, ...diags.fragment, ...diags.link].some(
      (d) => d.severity === "error",
    );
    return !hasError;
  }).length;
  return `${linked} compiled`;
}

/** Runtime log row's relative time column: seconds since the buffer's first entry (dc log "time" column). */
export function relativeLogTime(ts: number, baseTs: number): string {
  return `${(Math.max(0, ts - baseTs) / 1000).toFixed(1)}s`;
}

/** Strip metric values (단일 출처; DiagnosticsMetricStrip이 유일 소비처). */
export interface DiagnosticsMetricValues {
  gpu: string;
  frame: string;
  draws: string;
  shaders: string;
}

export function diagnosticsMetricValues(input: {
  glInfo: GlInfo | null;
  fps: number;
  drawCalls: number;
  nodes: readonly GraphNode[];
  byNode: Record<string, NodeDiagnostics>;
}): DiagnosticsMetricValues {
  return {
    gpu: input.glInfo ? input.glInfo.renderer : "—",
    frame: frameMetricValue(input.fps),
    draws: String(input.drawCalls),
    shaders: linkedProgramsValue(input.nodes, input.byNode),
  };
}
