/**
 * Pure aggregation for the Problems tab's severity summary chips
 * (design/Side Panel.dc.html L191-195: "1 error" / "1 warning" / "1 info").
 * Kept separate from ProblemsPanel so the counting logic has a unit-testable
 * surface independent of store wiring / DOM.
 */

export interface ProblemSeverityEntry {
  severity: "error" | "warning" | "info";
}

export interface ProblemsSummary {
  error: number;
  warning: number;
  info: number;
}

/**
 * Counts diagnostic entries by severity, folding runtime render errors
 * (rendererStore.stats.errors) into the "error" bucket alongside shader
 * diagnostics of severity "error".
 */
export function summarizeProblems(
  entries: ReadonlyArray<ProblemSeverityEntry>,
  runtimeErrorCount: number,
): ProblemsSummary {
  const summary: ProblemsSummary = { error: 0, warning: 0, info: 0 };
  for (const entry of entries) {
    summary[entry.severity] += 1;
  }
  summary.error += runtimeErrorCount;
  return summary;
}
