/**
 * StatusBar left-pill text/tone derivation — design/System States.dc.html
 * L566-572 (`cfg` per state key: `statusC`/`statusT`). Pure function so the
 * priority order is unit-testable without mounting the renderer/graph/
 * diagnostics stores.
 */
export interface StatusSummaryInput {
  ready: boolean;
  contextUnavailable: boolean;
  nodeCount: number;
  paneCount: number;
  compileErrorCount: number;
}

export type StatusTone = "success" | "warning" | "error" | "muted";

export function statusSummary(i: StatusSummaryInput): {
  text: string;
  tone: StatusTone;
} {
  // dc "gpu-unsupported" (L572): statusC #f0555c(error) · statusT
  // "WebGL2 unavailable" — GPU context creation failed outright, outranks
  // every other signal since nothing downstream can be trusted.
  if (i.contextUnavailable) {
    return { text: "WebGL2 unavailable", tone: "error" };
  }
  // dc "compile-error" (L571): statusC #f0555c(error) · statusT "1 error"
  // (pluralized here — the design mock hardcodes the singular example).
  if (i.compileErrorCount > 0) {
    const n = i.compileErrorCount;
    return { text: `${n} error${n === 1 ? "" : "s"}`, tone: "error" };
  }
  // dc "empty-viewport" (L567): statusC #f5b13d(warning) · statusT
  // "No render target" — graph has nodes but nothing reaches an Output pane.
  if (i.ready && i.nodeCount > 0 && i.paneCount === 0) {
    return { text: "No render target", tone: "warning" };
  }
  // dc "empty-graph" (L566): statusC #34d399(success) · statusT "GL ready".
  if (i.ready) {
    return { text: "GL ready", tone: "success" };
  }
  // Not covered by any dc state — pre-init cold start, kept from the
  // pre-existing StatusBar behavior (muted, no dc line).
  return { text: "GL init", tone: "muted" };
}
