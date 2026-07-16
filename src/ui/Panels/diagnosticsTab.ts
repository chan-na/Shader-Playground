/**
 * Pure helpers for the Diagnostics tab's metric grid + runtime log
 * (design/Side Panel.dc.html L217-238, diagStats/diagLog L384-396).
 * Kept separate from DiagnosticsPanel so the value-formatting logic has a
 * unit-testable surface independent of store wiring / DOM.
 */

import type { GraphNode } from "../../core/graph/types";
import type { NodeDiagnostics } from "../../state/diagnosticsStore";

/** "Frame" metric card value: `<ms> ms · <fps> fps` (dc L386), or "—" when idle. */
export function frameMetricValue(fps: number): string {
  return fps > 0 ? `${(1000 / fps).toFixed(1)} ms · ${fps} fps` : "—";
}

/**
 * "Programs" metric card value: `<linked> linked` (dc L388).
 *
 * There is no GL program cache in any store to count directly, so this is a
 * graph-shape proxy: the program count is the number of shader/compute nodes,
 * and a program counts as "linked" when its node has no severity==="error"
 * diagnostic across vertex/fragment/link (a node with only warnings, or no
 * diagnostics at all, is still linked).
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
  return `${linked} linked`;
}

/** Runtime log row's relative time column: seconds since the buffer's first entry (dc L391-395 "time"). */
export function relativeLogTime(ts: number, baseTs: number): string {
  return `${(Math.max(0, ts - baseTs) / 1000).toFixed(1)}s`;
}
