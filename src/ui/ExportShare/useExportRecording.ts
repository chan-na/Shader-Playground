import { useCallback, useEffect, useState } from "react";
import type { ExportTarget } from "../../state/exportShareStore";
import { useGifRecorderStore } from "../../state/gifRecorder";
import { useRecorderStore } from "../../state/recorder";

/** Export & Share dialog local phases (design/Export & Share.dc.html's
 * `phase` prop). "recording"/"encoding" drive the GIF/WebM Record flow
 * on top of "configure"/"done". */
export type ExportSharePhase = "configure" | "recording" | "encoding" | "done";

/**
 * Recorder-facing state of the Export & Share dialog: the GIF/WebM capture
 * settings, the live GIF/WebM recorder store status, the phase actually shown
 * (`displayPhase`) and the WebM elapsed-time tick.
 *
 * The handlers that move a capture through record → encode → done
 * (`handleStopGif` and its auto-stop effect, `handleStopWebm`, the start/save
 * handlers) stay in ExportShareDialog: they write the dialog-owned `phase` /
 * `recordDone` state, and keeping them there leaves the dialog's effect order
 * (open-reset → Escape → GIF auto-stop) and dependency lists untouched.
 */
export function useExportRecording(
  open: boolean,
  target: ExportTarget,
  phase: ExportSharePhase,
) {
  const [gifFps, setGifFps] = useState(12);
  const [gifLongEdge, setGifLongEdge] = useState(480);
  const [gifDuration, setGifDuration] = useState(4);
  const [gifDither, setGifDither] = useState(true);
  const [webmFps, setWebmFps] = useState(30);

  const gifStatus = useGifRecorderStore((s) => s.status);
  const gifFrameCount = useGifRecorderStore((s) => s.frameCount);
  const gifElapsedMs = useGifRecorderStore((s) => s.elapsedMs);
  const gifEncodeProgress = useGifRecorderStore((s) => s.encodeProgress);
  const webmStatus = useRecorderStore((s) => s.status);
  const webmStartedAt = useRecorderStore((s) => s.startedAt);

  // The recording/encoding phases are driven straight off the recorder
  // stores' own status (source of truth — Viewport's RAF loop and the
  // stores' internal start()/stop() flip these independently of anything
  // this dialog does), falling back to the locally-tracked "configure"/
  // "done" for everything else. This keeps the dialog correct even if a
  // recording was started elsewhere (e.g. AppToolbar's quick GIF button)
  // while it was closed.
  const displayPhase: ExportSharePhase =
    target === "gif"
      ? gifStatus === "recording"
        ? "recording"
        : gifStatus === "encoding"
          ? "encoding"
          : phase
      : target === "webm"
        ? webmStatus === "recording"
          ? "recording"
          : phase
        : phase;

  // Local 250ms tick for the WebM recording panel's elapsed counter — the
  // recorder store only tracks `startedAt` (no running elapsed field), so the
  // dialog derives "now" itself instead of the store growing a ticker the
  // way gifRecorder's Viewport-driven tick() does.
  const [webmNow, setWebmNow] = useState(() => performance.now());
  useEffect(() => {
    if (!open || target !== "webm" || webmStatus !== "recording") return;
    const id = window.setInterval(() => setWebmNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [open, target, webmStatus]);

  // Stops whichever recorder is actually active — used when the dialog is
  // closed or the rail target is switched mid-recording/encoding, so a
  // GIF/WebM capture never keeps running (and Viewport never keeps feeding
  // it frames) after the user has navigated away from it. GIF mid-encode has
  // no cancel API, so that case just lets the encode finish in the
  // background and its result is silently discarded (never surfaced).
  const stopAnyActiveRecording = useCallback(() => {
    if (useGifRecorderStore.getState().status !== "idle") {
      void useGifRecorderStore.getState().stop();
    }
    if (useRecorderStore.getState().status !== "idle") {
      void useRecorderStore.getState().stop();
    }
  }, []);

  return {
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
  };
}
