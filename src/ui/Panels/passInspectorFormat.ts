/**
 * Pure string-formatting helpers for the Pass Inspector (T1/D-1). No React,
 * no store reads — everything here takes plain values already sourced from
 * `passPlanStore`/`gpuTimerStore` and returns a display string. Kept separate
 * from `PassInspector.tsx` so the formatting rules have their own focused
 * unit tests independent of rendering/store wiring.
 */

/** "1920×1080 (1×)" / "960×540 (0.5×)" — FBO size + the resolutionScale that
 * produced it, so a downsampled pass reads as downsampled rather than as an
 * unexplained smaller number. */
export function formatFbo(
  width: number,
  height: number,
  scale: number,
): string {
  return `${width}×${height} (${scale}×)`;
}

/** "u_tex ← noise1 (unit 0)" — which texture unit a sampler uniform is bound
 * to and which upstream node feeds it. */
export function formatSampler(
  uniformName: string,
  sourceLabel: string,
  unit: number,
): string {
  return `${uniformName} ← ${sourceLabel} (unit ${unit})`;
}

/** GPU timer column. `undefined` means no sample has landed yet for this
 * node (extension unsupported/disabled is handled by the caller before this
 * is even invoked) — rendered as an em dash rather than "0.00" or "NaN" so
 * "no data" and "measured zero" never look the same. */
export function formatGpuMs(ms: number | undefined): string {
  return ms === undefined ? "—" : ms.toFixed(2);
}

/** "POINTS ×1024, read=A" — a compute pass's draw mode, instance count, and
 * which ping-pong buffer side is currently the readable (freshest) one. */
export function computeMeshLabel(
  primitiveLabel: string,
  count: number,
  read: "A" | "B",
): string {
  return `${primitiveLabel} ×${count}, read=${read}`;
}
