import type { GlInfo } from "../../state/rendererStore";

/**
 * Pure composer for the one-click bug-report snapshot. All inputs are injected
 * (no store reads) so it stays trivially testable; the panel gathers the live
 * values via getState() and hands them in.
 */
export interface DiagnosticsReportInput {
  timestamp: number;
  userAgent: string;
  screen: { width: number; height: number; dpr: number };
  glInfo: GlInfo | null;
  stats: {
    fps: number;
    drawCalls: number;
    renderTick: number;
    errorCount: number;
  };
  graph: { nodes: number; edges: number };
  logText: string;
}

export function buildDiagnosticsReport(input: DiagnosticsReportInput): string {
  const { screen, glInfo, stats, graph } = input;
  return [
    "=== ShaderPlayground Diagnostics ===",
    `time: ${new Date(input.timestamp).toISOString()}`,
    `userAgent: ${input.userAgent}`,
    `screen: ${screen.width}x${screen.height} @ ${screen.dpr}x`,
    `GL renderer: ${glInfo?.renderer ?? "unknown"}`,
    `GL version: ${glInfo?.version ?? "unknown"}`,
    `graph: ${graph.nodes} nodes, ${graph.edges} edges`,
    `render: ${stats.fps} fps, ${stats.drawCalls} draws, renderTick ${stats.renderTick}, ${stats.errorCount} errors`,
    "--- log ---",
    input.logText || "(empty)",
  ].join("\n");
}
