/**
 * Pure helpers, option lists and types for the Export & Share dialog's Record
 * (GIF/WebM) flow (M6-U4). Deliberately store/React-free so they're trivial
 * to unit test — only the ExportShare dialog modules import this.
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

/** Option lists for the GIF/WebM configure panels' segmented controls. */
export const GIF_SIZE_OPTIONS = [
  { value: "240", label: "240px", dataTestId: "es-gif-size-240" },
  { value: "480", label: "480px", dataTestId: "es-gif-size-480" },
  { value: "960", label: "960px", dataTestId: "es-gif-size-960" },
];
export const GIF_FPS_OPTIONS = [
  { value: "12", label: "12", dataTestId: "es-gif-fps-12" },
  { value: "20", label: "20", dataTestId: "es-gif-fps-20" },
  { value: "30", label: "30", dataTestId: "es-gif-fps-30" },
];
export const WEBM_FPS_OPTIONS = [
  { value: "24", label: "24", dataTestId: "es-webm-fps-24" },
  { value: "30", label: "30", dataTestId: "es-webm-fps-30" },
  { value: "60", label: "60", dataTestId: "es-webm-fps-60" },
];

/** Info kept around once a GIF/WebM recording finishes, so the done panel
 * can render a stable file name/meta line independent of the live config
 * controls (which the user could otherwise keep dragging after the fact). */
export interface RecordDoneInfo {
  kind: "gif" | "webm";
  blob: Blob;
  fileName: string;
  metaLine: string;
}

/**
 * 녹화 산출물 크기 표기 [D16]. 완료 카드 metaLine과 저장 토스트가 같은 값을
 * 쓰도록 한 곳에 모아 둔다 — HTML은 KB, 녹화는 MB로 각 완료 카드의 단위를
 * 따르되 토스트 형태는 `Exported {name} · {size}`로 공통.
 */
export function recordSizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
