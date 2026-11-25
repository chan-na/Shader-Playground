import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_EXPORT_BASE,
  exportFileName,
} from "../../export/exportFileName";
import {
  buildExportedHtml,
  downloadExportedHtml,
} from "../../export/htmlExport";
import {
  type ExportTarget,
  useExportShareStore,
} from "../../state/exportShareStore";
import { useGifRecorderStore } from "../../state/gifRecorder";
import { useGraphStore } from "../../state/graphStore";
import { useRecorderStore } from "../../state/recorder";
import { toast } from "../../state/toastStore";
import { triggerDownload } from "../../utils/downloadBlob";
import { getViewportCanvas } from "../Viewport/viewportCanvas";
import {
  BusyFooter,
  ConfigureFooter,
  DoneHtmlPanel,
  DoneLinkPanel,
  DoneRecordPanel,
  EncodingPanel,
  GifConfigurePanel,
  HtmlConfigurePanel,
  LinkConfigurePanel,
  RailNav,
  RecordingPanel,
  WebmConfigurePanel,
} from "./ExportSharePanels";
import {
  gifProgressPct,
  type RecordDoneInfo,
  recordSizeLabel,
  webmElapsedLabel,
} from "./recordConfig";
import {
  type ExportSharePhase,
  useExportRecording,
} from "./useExportRecording";

// This component itself is intentionally *not* React.lazy-loaded: App.tsx
// mounts it statically and keeps it mounted while closed so its GIF-recorder
// subscription can track AppToolbar's quick-record button (see the
// displayPhase comment in useExportRecording and the auto-stop comment
// below). Only the shareUrl module (used solely by handleCreateLink, below)
// is loaded on demand.
export function ExportShareDialog() {
  const open = useExportShareStore((s) => s.open);
  const target = useExportShareStore((s) => s.target);
  const setTarget = useExportShareStore((s) => s.setTarget);
  const close = useExportShareStore((s) => s.close);

  const nodes = useGraphStore((s) => s.nodes);
  const rev = useGraphStore((s) => s.rev);

  const [phase, setPhase] = useState<ExportSharePhase>("configure");
  const [fileName, setFileName] = useState<string>(DEFAULT_EXPORT_BASE);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [htmlDoneName, setHtmlDoneName] = useState<string | null>(null);

  const [recordDone, setRecordDone] = useState<RecordDoneInfo | null>(null);

  const {
    gifFps,
    setGifFps,
    gifLongEdge,
    setGifLongEdge,
    gifDuration,
    setGifDuration,
    gifDither,
    setGifDither,
    webmFps,
    setWebmFps,
    gifStatus,
    gifFrameCount,
    gifElapsedMs,
    gifEncodeProgress,
    webmStartedAt,
    webmNow,
    displayPhase,
    stopAnyActiveRecording,
  } = useExportRecording(open, target, phase);

  // Every fresh open starts on a clean configure screen, regardless of how
  // the previous session ended (mirrors CommandPalette's query/active reset
  // on toggle rather than persisting stale "done" state across opens).
  useEffect(() => {
    if (open) {
      setPhase("configure");
      setShareUrl(null);
      setCopied(false);
      setRecordDone(null);
      setHtmlDoneName(null);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    stopAnyActiveRecording();
    close();
  }, [stopAnyActiveRecording, close]);

  // Escape-to-close — registered only while open, bubble phase (HelpModal /
  // CommandPalette pattern, not capture).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  const handleStopGif = useCallback(async () => {
    // Idempotent: bails if a previous call already moved status off
    // "recording" (auto-stop-on-duration and the manual Stop button can
    // otherwise both fire in the same tick). No need to locally track
    // "encoding" here — stop() flips the store's own status to "encoding"
    // synchronously, and displayPhase mirrors that directly.
    if (useGifRecorderStore.getState().status !== "recording") return;
    const blob = await useGifRecorderStore.getState().stop();
    if (blob) {
      setRecordDone({
        kind: "gif",
        blob,
        fileName: exportFileName(DEFAULT_EXPORT_BASE, "gif"),
        metaLine: `${recordSizeLabel(blob.size)} · ${gifFps} fps · ${gifDuration.toFixed(1)}s`,
      });
      setPhase("done");
    } else {
      // stop() already surfaced a toast (e.g. zero frames captured).
      setPhase("configure");
    }
  }, [gifFps, gifDuration]);

  // GIF auto-stops once elapsed reaches the configured duration — the
  // recorder itself caps frame capture at maxSeconds, but stop()/encode
  // still needs to be triggered from here. Guarded on `open`: this dialog
  // stays mounted (and subscribed to the GIF store) even while closed, so
  // without the guard a quick GIF recording started from AppToolbar's
  // toolbar button would get silently stopped+encoded by this dialog's own
  // (unrelated) local `gifDuration` default the moment it elapsed, flipping
  // status back to "idle" under the toolbar button's feet.
  useEffect(() => {
    if (!open || target !== "gif" || gifStatus !== "recording") return;
    if (gifElapsedMs >= gifDuration * 1000) {
      void handleStopGif();
    }
  }, [open, target, gifStatus, gifElapsedMs, gifDuration, handleStopGif]);

  const handleStopWebm = async () => {
    const startedAt = useRecorderStore.getState().startedAt;
    const blob = await useRecorderStore.getState().stop();
    if (blob) {
      const elapsedLabel = webmElapsedLabel(
        startedAt ?? performance.now(),
        performance.now(),
      );
      setRecordDone({
        kind: "webm",
        blob,
        fileName: exportFileName(DEFAULT_EXPORT_BASE, "webm"),
        metaLine: `${recordSizeLabel(blob.size)} · ${webmFps} fps · ${elapsedLabel}`,
      });
      setPhase("done");
    } else {
      setPhase("configure");
    }
  };

  // buildExportedHtml's output length only meaningfully changes on
  // structural graph edits, so `rev` (bumped on those, not on uniform-only
  // scrubs) is the memo key — the actual nodes/edges/positions are read
  // fresh from the store inside instead of being listed as deps, so a
  // uniform drag elsewhere (new `nodes` array reference, same `rev`) can't
  // re-trigger this string-length recompute.
  const sizeKB = useMemo(() => {
    // The dialog is mounted for the whole session but rendered only
    // while `open`. Without this guard, every structural graph edit — every
    // node add, every edge, every source recompile that bumps `rev` — built
    // the entire standalone HTML document just to measure its length, for a
    // panel nobody is looking at. The hook itself stays above the
    // `if (!open) return null` early return (biome `useHookAtTopLevel`).
    if (!open) return 0;
    const s = useGraphStore.getState();
    const html = buildExportedHtml(
      { nodes: s.nodes, edges: s.edges },
      s.positions,
      { parents: s.parents },
    );
    // `rev` genuinely drives this recompute (see comment above) — touch it
    // directly so it reads as a real dependency, not just a list entry.
    void rev;
    return Math.max(1, Math.round(html.length / 1024));
  }, [rev, open]);

  if (!open) return null;

  const canvas = getViewportCanvas();
  const subtitle = canvas
    ? `${nodes.length} nodes · ${canvas.width}×${canvas.height} viewport`
    : `${nodes.length} nodes`;

  const selectTarget = (next: ExportTarget) => {
    stopAnyActiveRecording();
    setTarget(next);
    setPhase("configure");
    setShareUrl(null);
    setCopied(false);
    setHtmlDoneName(null);
  };

  const handleDownloadHtml = () => {
    const s = useGraphStore.getState();
    const savedName = downloadExportedHtml(
      { nodes: s.nodes, edges: s.edges },
      s.positions,
      fileName,
      s.parents,
    );
    setHtmlDoneName(savedName);
    toast.success(`Exported ${savedName} · ${sizeKB} KB`);
    setPhase("done");
  };

  const handleCreateLink = async () => {
    const s = useGraphStore.getState();
    try {
      // Dynamic import kept inside the try: BootstrapGate.tsx already loads
      // shareUrl dynamically for the initial `#share=` hash check, and a
      // static import here used to defeat that split (vite reporter warned
      // on every build — learnability T0-3). A chunk-fetch failure now
      // surfaces through the same catch → toast.error path as an encode
      // failure, instead of an unhandled rejection.
      const { encodeShareUrl } = await import("../../state/shareUrl");
      const url = await encodeShareUrl(
        { nodes: s.nodes, edges: s.edges },
        s.positions,
        // Default origin; `parents` is the 4th positional arg (the signature
        // order is pinned by shareUrl.test / phase-11).
        undefined,
        s.parents,
      );
      setShareUrl(url);
      setPhase("done");
    } catch (err) {
      toast.error(`Share link 생성 실패: ${(err as Error).message}`);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this share URL:", shareUrl);
    }
  };

  const handleStartGif = () => {
    if (!getViewportCanvas()) return;
    setRecordDone(null);
    // displayPhase picks up "recording" on its own once this flips the
    // store's status — start() is synchronous and only fails on a missing
    // 2D canvas context (surfaces its own toast.error in that case).
    useGifRecorderStore.getState().start({
      fps: gifFps,
      maxSeconds: gifDuration,
      maxLongEdge: gifLongEdge,
      dither: gifDither,
    });
  };

  const handleStartWebm = async () => {
    const canvas = getViewportCanvas();
    if (!canvas) return;
    setRecordDone(null);
    // displayPhase picks up "recording" on its own once this resolves
    // successfully; on failure the store already surfaced a toast.error and
    // status stays "idle", so displayPhase falls back to "configure".
    await useRecorderStore.getState().start(canvas, webmFps);
  };

  const handleSaveRecording = () => {
    if (!recordDone) return;
    const url =
      recordDone.kind === "gif"
        ? useGifRecorderStore.getState().lastBlobUrl
        : useRecorderStore.getState().lastBlobUrl;
    if (!url) return;
    triggerDownload(url, recordDone.fileName);
    toast.success(
      `Exported ${recordDone.fileName} · ${recordSizeLabel(recordDone.blob.size)}`,
    );
  };

  const gifDurationLabel = `${gifDuration.toFixed(1)}s`;
  const gifElapsedLabel = `${(gifElapsedMs / 1000).toFixed(1)}s`;
  const webmElapsed = webmElapsedLabel(webmStartedAt ?? webmNow, webmNow);

  return (
    <div
      className="es-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      data-testid="export-share-dialog"
    >
      <div className="es-modal">
        <div className="es-header">
          <span className="es-header-icon" aria-hidden="true">
            ⤴
          </span>
          <div className="es-header-text">
            <div className="es-header-title">Export &amp; Share</div>
            <div className="es-header-subtitle">{subtitle}</div>
          </div>
          <div className="es-header-spacer" />
          <button
            type="button"
            className="es-close"
            onClick={handleClose}
            aria-label="Close export & share dialog"
            data-testid="es-close"
          >
            ✕
          </button>
        </div>

        <div className="es-body">
          <RailNav target={target} onSelect={selectTarget} />

          <div className="es-main">
            {displayPhase === "configure" && target === "html" && (
              <HtmlConfigurePanel
                fileName={fileName}
                onFileNameChange={setFileName}
                sizeKB={sizeKB}
              />
            )}
            {displayPhase === "configure" && target === "link" && (
              <LinkConfigurePanel />
            )}
            {displayPhase === "configure" && target === "gif" && (
              <GifConfigurePanel
                fps={gifFps}
                longEdge={gifLongEdge}
                duration={gifDuration}
                dither={gifDither}
                onFpsChange={setGifFps}
                onLongEdgeChange={setGifLongEdge}
                onDurationChange={setGifDuration}
                onDitherChange={setGifDither}
              />
            )}
            {displayPhase === "configure" && target === "webm" && (
              <WebmConfigurePanel fps={webmFps} onFpsChange={setWebmFps} />
            )}

            {displayPhase === "recording" && target === "gif" && (
              <RecordingPanel
                counterLabel={`${gifFrameCount} frames captured`}
                elapsedLabel={gifElapsedLabel}
                totalLabel={gifDurationLabel}
                progressPct={gifProgressPct(gifElapsedMs, gifDuration)}
              />
            )}
            {displayPhase === "recording" && target === "webm" && (
              <RecordingPanel
                counterLabel={webmElapsed}
                elapsedLabel=""
                totalLabel={null}
                progressPct={null}
              />
            )}

            {displayPhase === "encoding" && target === "gif" && (
              <EncodingPanel progress={gifEncodeProgress} />
            )}

            {displayPhase === "done" && target === "html" && htmlDoneName && (
              <div className="es-done">
                <div className="es-done-icon" aria-hidden="true">
                  ✓
                </div>
                <DoneHtmlPanel savedFileName={htmlDoneName} sizeKB={sizeKB} />
                <div className="es-done-actions">
                  <button
                    type="button"
                    className="es-btn-secondary"
                    onClick={() => setPhase("configure")}
                    data-testid="es-export-again"
                  >
                    Export again
                  </button>
                  <button
                    type="button"
                    className="es-btn-primary"
                    onClick={close}
                    data-testid="es-done-close"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
            {displayPhase === "done" && target === "link" && shareUrl && (
              <div className="es-done">
                <div className="es-done-icon" aria-hidden="true">
                  ✓
                </div>
                <DoneLinkPanel
                  url={shareUrl}
                  copied={copied}
                  onCopy={() => void handleCopyLink()}
                />
                <div className="es-done-actions">
                  <button
                    type="button"
                    className="es-btn-secondary"
                    onClick={() => setPhase("configure")}
                    data-testid="es-export-again"
                  >
                    Export again
                  </button>
                  <button
                    type="button"
                    className="es-btn-primary"
                    onClick={close}
                    data-testid="es-done-close"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
            {displayPhase === "done" &&
              recordDone &&
              (target === "gif" || target === "webm") &&
              target === recordDone.kind && (
                <div className="es-done">
                  <div className="es-done-icon" aria-hidden="true">
                    ✓
                  </div>
                  <DoneRecordPanel info={recordDone} />
                  <div className="es-done-actions">
                    <button
                      type="button"
                      className="es-btn-secondary"
                      onClick={() => setPhase("configure")}
                      data-testid="es-export-again"
                    >
                      Export again
                    </button>
                    <button
                      type="button"
                      className="es-btn-primary"
                      onClick={handleSaveRecording}
                      data-testid="es-save-recording"
                    >
                      Save to disk
                    </button>
                  </div>
                </div>
              )}

            {displayPhase === "configure" && target === "html" && (
              <ConfigureFooter
                hint={`${sizeKB} KB estimated`}
                primaryLabel="↓ Download HTML"
                onPrimary={handleDownloadHtml}
                onCancel={handleClose}
                primaryTestId="es-download-html"
              />
            )}
            {displayPhase === "configure" && target === "link" && (
              <ConfigureFooter
                hint="gzip + base64url, client-side only"
                primaryLabel="⤴ Create link"
                onPrimary={() => void handleCreateLink()}
                onCancel={handleClose}
                primaryTestId="es-create-link"
              />
            )}
            {displayPhase === "configure" && target === "gif" && (
              <ConfigureFooter
                hint={`${gifDuration.toFixed(1)}s · ${gifLongEdge}px · ${gifFps} fps`}
                primaryLabel="● Start recording"
                onPrimary={handleStartGif}
                onCancel={handleClose}
                primaryTestId="es-start-recording"
              />
            )}
            {displayPhase === "configure" && target === "webm" && (
              <ConfigureFooter
                hint={`${webmFps} fps · manual stop`}
                primaryLabel="● Start recording"
                onPrimary={() => void handleStartWebm()}
                onCancel={handleClose}
                primaryTestId="es-start-recording"
              />
            )}
            {displayPhase === "recording" && (
              <BusyFooter
                label={target === "gif" ? "Stop & encode" : "Stop"}
                onStop={() =>
                  void (target === "gif" ? handleStopGif() : handleStopWebm())
                }
              />
            )}
            {displayPhase === "encoding" && (
              <div className="es-footer">
                <span className="es-footer-hint">
                  GIF encoding can’t be canceled — it finishes in the
                  background.
                </span>
                <div className="es-footer-spacer" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
