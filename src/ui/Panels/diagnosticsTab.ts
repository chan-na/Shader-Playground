/**
 * Pure helpers backing the diagnostics metric values + runtime log
 * (design/Side Panel.dc.html L217-238, diagStats/diagLog L384-396).
 * [X12 §v2.1] The metric-value helpers' sole consumer is now the overlay's
 * DiagnosticsMetricStrip (the 2×2 metric-card grid this file originally
 * backed was removed from DiagnosticsPanel). The runtime-log helper
 * (relativeLogTime) is still consumed by DiagnosticsPanel itself.
 * Kept separate from those components so the value-formatting logic has a
 * unit-testable surface independent of store wiring / DOM.
 */

import type { GraphNode } from "../../core/graph/types";
import type { NodeDiagnostics } from "../../state/diagnosticsStore";
import type { GlInfo } from "../../state/rendererStore";

/** "Frame" metric value: `<ms> ms · <fps> fps` (dc L386), or "—" when idle. */
export function frameMetricValue(fps: number): string {
  return fps > 0 ? `${(1000 / fps).toFixed(1)} ms · ${fps} fps` : "—";
}

/**
 * "Shaders" metric card value: `<n> compiled` (dc L388, v1.2).
 *
 * There is no GL program cache in any store to count directly, so this is a
 * graph-shape proxy: the count is the number of shader/compute nodes, and one
 * counts as compiled when its node has no severity==="error" diagnostic across
 * vertex/fragment/link (a node with only warnings, or no diagnostics at all,
 * still counts).
 *
 * [A-6] The dc's v1.1 label was "Programs: N linked", which implied a real GL
 * link counter this proxy can't provide. Rather than expose a new GL-layer
 * counter (out of scope), v1.2 moved the label to "Shaders: N compiled" to
 * match what is actually being measured. A true linked-program count remains a
 * post-v1.2 task.
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

/** Runtime log row's relative time column: seconds since the buffer's first entry (dc L391-395 "time"). */
export function relativeLogTime(ts: number, baseTs: number): string {
  return `${(Math.max(0, ts - baseTs) / 1000).toFixed(1)}s`;
}

/** Strip metric values (S7 single source; X12로 카드 제거 후 스트립이 유일 소비처). */
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
