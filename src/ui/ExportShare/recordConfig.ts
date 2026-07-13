/**
 * Pure helpers for the Export & Share dialog's Record (GIF/WebM) flow
 * (M6-U4). Deliberately store/React-free so they're trivial to unit test —
 * ExportShareDialog.tsx is the only importer.
 */

/** Reference point the estimate formula is scaled from (480px · 12fps · 4s). */
const GIF_ESTIMATE_BASE_MB = 3.4;
const GIF_ESTIMATE_REFERENCE_LONG_EDGE = 480;
const GIF_ESTIMATE_REFERENCE_FPS = 12;
const GIF_ESTIMATE_REFERENCE_SECONDS = 4;

/**
 * Heuristic output size estimate for the GIF configure panel's "est." chip
 * (design/Export & Share.dc.html L440-443's formula, reparameterized around
 * this app's longEdge/fps/duration controls instead of the mock's
 * resolution-preset + fixed-duration version). Size scales with the frame
 * area (longEdge²) and linearly with fps/duration.
 */
export function estimateGifSizeMB(
  fps: number,
  longEdge: number,
  seconds: number,
): string {
  const mb =
    GIF_ESTIMATE_BASE_MB *
    (longEdge / GIF_ESTIMATE_REFERENCE_LONG_EDGE) ** 2 *
    (fps / GIF_ESTIMATE_REFERENCE_FPS) *
    (seconds / GIF_ESTIMATE_REFERENCE_SECONDS);
  return `${mb.toFixed(1)} MB`;
}

/** Recording progress 0..100 for the elapsed/duration bar, clamped so a
 * capture that overruns its cap (or a not-yet-started 0ms elapsed) never
 * over/underflows the bar. */
export function gifProgressPct(elapsedMs: number, maxSeconds: number): number {
  if (maxSeconds <= 0) return 0;
  const pct = (elapsedMs / (maxSeconds * 1000)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** "3.2s"-style elapsed-time label for the WebM recording panel's counter
 * (no fixed duration to show progress against, unlike GIF). */
export function webmElapsedLabel(startedAt: number, now: number): string {
  const seconds = Math.max(0, (now - startedAt) / 1000);
  return `${seconds.toFixed(1)}s`;
}
