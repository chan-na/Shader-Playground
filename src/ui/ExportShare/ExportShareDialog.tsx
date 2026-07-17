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
import { encodeShareUrl } from "../../state/shareUrl";
import { toast } from "../../state/toastStore";
import { SegmentedControl } from "../controls/SegmentedControl";
import { Slider } from "../controls/Slider";
import { TextField } from "../controls/TextField";
import { Toggle } from "../controls/Toggle";
import {
  estimateGifSizeMB,
  gifProgressPct,
  webmElapsedLabel,
} from "./recordConfig";

/** Export & Share dialog local phases (design/Export & Share.dc.html's
 * `phase` prop). "recording"/"encoding" drive the GIF/WebM Record flow
 * (M6-U4) on top of M6-U3's "configure"/"done". */
type ExportSharePhase = "configure" | "recording" | "encoding" | "done";

interface RailItem {
  target: ExportTarget;
  name: string;
  meta: string;
  glyph: string;
}

/** design/Export & Share.dc.html L412-424 — Record/Export/Share groups.
 * MP4/Code snippet/visibility items from the same mock are intentionally
 * omitted (out of scope for this app). */
const RAIL_GROUPS: Array<{ label: string; items: RailItem[] }> = [
  {
    label: "Record",
    items: [
      {
        target: "gif",
        name: "Animated GIF",
        meta: "loop · ≤256 col",
        glyph: "◱",
      },
      {
        target: "webm",
        name: "WebM video",
        meta: "VP9 · MediaRecorder",
        glyph: "◈",
      },
    ],
  },
  {
    label: "Export",
    items: [
      {
        target: "html",
        name: "Standalone HTML",
        meta: "single file",
        glyph: "▤",
      },
    ],
  },
  {
    label: "Share",
    items: [
      { target: "link", name: "Share link", meta: "URL · #share=", glyph: "⤴" },
    ],
  },
];

const GIF_SIZE_OPTIONS = [
  { value: "240", label: "240px", dataTestId: "es-gif-size-240" },
  { value: "480", label: "480px", dataTestId: "es-gif-size-480" },
  { value: "960", label: "960px", dataTestId: "es-gif-size-960" },
];
const GIF_FPS_OPTIONS = [
  { value: "12", label: "12", dataTestId: "es-gif-fps-12" },
  { value: "20", label: "20", dataTestId: "es-gif-fps-20" },
  { value: "30", label: "30", dataTestId: "es-gif-fps-30" },
];
const WEBM_FPS_OPTIONS = [
  { value: "24", label: "24", dataTestId: "es-webm-fps-24" },
  { value: "30", label: "30", dataTestId: "es-webm-fps-30" },
  { value: "60", label: "60", dataTestId: "es-webm-fps-60" },
];

/** Info kept around once a GIF/WebM recording finishes, so the done panel
 * can render a stable file name/meta line independent of the live config
 * controls (which the user could otherwise keep dragging after the fact). */
interface RecordDoneInfo {
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
function recordSizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function viewportCanvas(): HTMLCanvasElement | null {
  return document.querySelector(".viewport-canvas") as HTMLCanvasElement | null;
}

function RailNav({
  target,
  onSelect,
}: {
  target: ExportTarget;
  onSelect: (target: ExportTarget) => void;
}) {
  return (
    <nav className="es-rail" aria-label="Export & share targets">
      {RAIL_GROUPS.map((group) => (
        <div key={group.label} className="es-rail-group">
          <div className="es-rail-group-label">{group.label}</div>
          <div className="es-rail-items">
            {group.items.map((item) => {
              const active = item.target === target;
              return (
                <button
                  key={item.target}
                  type="button"
                  className={
                    active
                      ? "es-rail-item es-rail-item--active"
                      : "es-rail-item"
                  }
                  onClick={() => onSelect(item.target)}
                  data-testid={`es-rail-${item.target}`}
                >
                  <span
                    className={`es-rail-icon es-rail-icon--${item.target}`}
                    aria-hidden="true"
                  >
                    {item.glyph}
                  </span>
                  <span className="es-rail-main">
                    <span className="es-rail-name">{item.name}</span>
                    <span className="es-rail-meta">{item.meta}</span>
                  </span>
                  {active && (
                    <span className="es-rail-dot" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function ConfigureFooter({
  hint,
  primaryLabel,
  onPrimary,
  onCancel,
  primaryTestId,
}: {
  hint: string;
  primaryLabel: string;
  onPrimary: () => void;
  onCancel: () => void;
  primaryTestId: string;
}) {
  return (
    <div className="es-footer">
      <span className="es-footer-hint">{hint}</span>
      <div className="es-footer-spacer" />
      <button
        type="button"
        className="es-btn-cancel"
        onClick={onCancel}
        data-testid="es-cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        className="es-btn-primary"
        onClick={onPrimary}
        data-testid={primaryTestId}
      >
        {primaryLabel}
      </button>
    </div>
  );
}

/** Footer while a recording is in flight — a single "Stop" action, no
 * hint/cancel (design/Export & Share.dc.html L300-305). */
function BusyFooter({ label, onStop }: { label: string; onStop: () => void }) {
  return (
    <div className="es-footer">
      <div className="es-footer-spacer" />
      <button
        type="button"
        className="es-btn-secondary"
        onClick={onStop}
        data-testid="es-stop-recording"
      >
        {label}
      </button>
    </div>
  );
}

function HtmlConfigurePanel({
  fileName,
  onFileNameChange,
  sizeKB,
}: {
  fileName: string;
  onFileNameChange: (name: string) => void;
  sizeKB: number;
}) {
  return (
    <div className="es-panel">
      <div className="es-panel-title">Standalone HTML</div>
      <div className="es-panel-desc">
        One file, no dependencies — runs the WebGL2 render loop straight from a
        browser.
      </div>
      <div className="es-file-card">
        <div className="es-file-tile" aria-hidden="true">
          HTML
        </div>
        <div className="es-file-card-main">
          {/* [C-10] The editable base is kept (it is the only way to name an
              HTML export — the app has no projectTitle state, see C-11a), and
              the dc's completed-filename display is reconciled with it as a
              static `-{timestamp}.html` suffix inside the same field. The
              timestamp itself is only fixed at download time, so it stays a
              placeholder rather than a live preview that would drift from the
              real name. design/Export & Share.dc.html L167-172. */}
          <div className="es-field-label">File name</div>
          <div className="es-filename-field">
            <TextField
              value={fileName}
              onChange={(e) => onFileNameChange(e.target.value)}
              dataTestId="es-html-filename"
              ariaLabel="HTML export file name"
              mono
            />
            <span className="es-filename-suffix" aria-hidden="true">
              -{"{timestamp}"}.html
            </span>
          </div>
          <div className="es-file-card-meta">
            {sizeKB} KB · WebGL2 · self-contained · timestamp added on download
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkConfigurePanel() {
  return (
    <div className="es-panel">
      <div className="es-panel-title">Share link</div>
      <div className="es-panel-desc">
        Encode the whole graph into a URL — recipients open it in the browser,
        no install.
      </div>
      <div className="es-info-card">
        The graph, node positions, and uniform values are gzip-compressed and
        base64url-encoded straight into the URL fragment — nothing is uploaded
        to a server.
        <div className="es-info-chip">#share=&lt;gzip+base64url&gt;</div>
      </div>
    </div>
  );
}

function GifConfigurePanel({
  fps,
  longEdge,
  duration,
  dither,
  onFpsChange,
  onLongEdgeChange,
  onDurationChange,
  onDitherChange,
}: {
  fps: number;
  longEdge: number;
  duration: number;
  dither: boolean;
  onFpsChange: (fps: number) => void;
  onLongEdgeChange: (longEdge: number) => void;
  onDurationChange: (duration: number) => void;
  onDitherChange: (dither: boolean) => void;
}) {
  const estSize = estimateGifSizeMB(fps, longEdge, duration);
  return (
    <div className="es-panel">
      <div className="es-rec-header">
        <div className="es-rec-title">Record GIF</div>
        <div className="es-rec-codec">≤256 color palette · dithered</div>
      </div>
      <div className="es-rec-grid">
        <div>
          <div className="es-rec-field-label">Size</div>
          <SegmentedControl
            options={GIF_SIZE_OPTIONS}
            value={String(longEdge)}
            onChange={(v) => onLongEdgeChange(Number.parseInt(v, 10))}
            ariaLabel="GIF size"
          />
        </div>
        <div>
          <div className="es-rec-field-label">Frame rate</div>
          <SegmentedControl
            options={GIF_FPS_OPTIONS}
            value={String(fps)}
            onChange={(v) => onFpsChange(Number.parseInt(v, 10))}
            ariaLabel="GIF frame rate"
          />
        </div>
        <div className="es-rec-field--wide">
          <div className="es-rec-duration-row">
            <span className="es-rec-field-label">Duration</span>
            <span
              className="es-rec-duration-value"
              data-testid="es-gif-duration-label"
            >
              {duration.toFixed(1)}s
            </span>
          </div>
          <Slider
            value={duration}
            min={1}
            max={10}
            step={0.5}
            onChange={onDurationChange}
            dataTestId="es-gif-duration"
            ariaLabel="GIF duration"
          />
        </div>
        <div className="es-rec-toggle-row">
          <Toggle
            checked={dither}
            onChange={onDitherChange}
            ariaLabel="Dithering"
            dataTestId="es-gif-dither"
          />
          <span className="es-rec-toggle-label">Dithering</span>
        </div>
        <div className="es-rec-est-row">
          <span className="es-rec-est-label">est.</span>
          <span className="es-rec-est-chip" data-testid="es-gif-est">
            {estSize}
          </span>
        </div>
      </div>
    </div>
  );
}

function WebmConfigurePanel({
  fps,
  onFpsChange,
}: {
  fps: number;
  onFpsChange: (fps: number) => void;
}) {
  return (
    <div className="es-panel">
      <div className="es-rec-header">
        <div className="es-rec-title">Record WebM</div>
        <div className="es-rec-codec">VP9·VP8 (MediaRecorder)</div>
      </div>
      <div className="es-rec-grid">
        <div>
          <div className="es-rec-field-label">Frame rate</div>
          <SegmentedControl
            options={WEBM_FPS_OPTIONS}
            value={String(fps)}
            onChange={(v) => onFpsChange(Number.parseInt(v, 10))}
            ariaLabel="WebM frame rate"
          />
        </div>
      </div>
      <div className="es-rec-desc">
        Records until you stop — encoded live by the browser.
      </div>
    </div>
  );
}

/** Recording panel shared by GIF/WebM (design/Export & Share.dc.html
 * L214-234). The preview is a 16/9 placeholder, not a mirrored canvas — the
 * real render is already visible behind the scrim/modal. GIF shows a
 * duration progress bar; WebM (no fixed length, manual stop) shows only the
 * elapsed counter up top. */
function RecordingPanel({
  counterLabel,
  elapsedLabel,
  totalLabel,
  progressPct,
}: {
  counterLabel: string;
  elapsedLabel: string;
  totalLabel: string | null;
  progressPct: number | null;
}) {
  return (
    <div className="es-panel">
      <div className="es-rec-live-header">
        <span className="es-rec-dot" aria-hidden="true" />
        <span className="es-rec-live-title">Recording…</span>
        <span className="es-rec-counter" data-testid="es-rec-counter">
          {counterLabel}
        </span>
      </div>
      <div className="es-rec-preview">
        <div className="es-rec-preview-badge">
          <span className="es-rec-preview-dot" aria-hidden="true" />
          REC
        </div>
      </div>
      {progressPct !== null && totalLabel !== null && (
        <>
          <div className="es-rec-elapsed-row">
            <span className="es-rec-elapsed">{elapsedLabel}</span>
            <span className="es-rec-elapsed-total">{totalLabel}</span>
          </div>
          <div className="es-rec-progress-track">
            <div
              className="es-rec-progress-fill"
              data-testid="es-rec-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Encoding panel (design/Export & Share.dc.html L238-251) — GIF-only,
 * since WebM's stop() already yields the final blob with no separate encode
 * step. There's no cancel-mid-encode API on the GIF store, so the busy
 * footer is a plain note instead of a button (see BusyFooter usage below). */
function EncodingPanel({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const dash = (circumference * pct) / 100;
  return (
    <div className="es-panel es-panel--center">
      <div className="es-enc-ring">
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle
            cx={48}
            cy={48}
            r={r}
            fill="none"
            strokeWidth={7}
            style={{ stroke: "var(--surface-input)" }}
          />
          <circle
            cx={48}
            cy={48}
            r={r}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ stroke: "var(--accent-default)" }}
            data-testid="es-enc-ring-progress"
          />
        </svg>
        <div className="es-enc-pct" data-testid="es-enc-pct">
          {pct}%
        </div>
      </div>
      <div className="es-enc-title">Encoding GIF…</div>
      <div className="es-enc-sub">quantizing + LZW encode</div>
    </div>
  );
}

function DoneHtmlPanel({
  savedFileName,
  sizeKB,
}: {
  savedFileName: string;
  sizeKB: number;
}) {
  return (
    <>
      <div className="es-done-title">HTML exported</div>
      <div className="es-done-msg">
        Your standalone file downloaded. Open it in any browser — no server
        needed.
      </div>
      <div className="es-done-file-card" data-testid="es-done-file-card">
        <div className="es-done-file-icon" aria-hidden="true">
          HTML
        </div>
        <div className="es-done-file-main">
          <div className="es-done-file-name">{savedFileName}</div>
          <div className="es-done-file-meta">
            {sizeKB} KB · WebGL2 · self-contained
          </div>
        </div>
      </div>
    </>
  );
}

function DoneLinkPanel({
  url,
  copied,
  onCopy,
}: {
  url: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <>
      <div className="es-done-title">Link is ready</div>
      <div className="es-done-msg">
        Anyone with this link can open a live, editable copy of the graph.
      </div>
      <div className="es-done-url-row">
        <span className="es-done-url" data-testid="es-share-url">
          {url}
        </span>
        <button
          type="button"
          className={copied ? "es-copy-btn es-copy-btn--copied" : "es-copy-btn"}
          onClick={onCopy}
          data-testid="es-copy-link"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </>
  );
}

function DoneRecordPanel({ info }: { info: RecordDoneInfo }) {
  const isGif = info.kind === "gif";
  return (
    <>
      <div className="es-done-title">
        {isGif ? "GIF exported" : "WebM exported"}
      </div>
      <div className="es-done-msg">
        {isGif
          ? "Your animated GIF is ready — save it to disk or export again with different settings."
          : "Your WebM clip is ready — save it to disk or export again."}
      </div>
      <div className="es-done-file-card" data-testid="es-done-file-card">
        <div
          className={
            isGif
              ? "es-done-file-icon es-done-file-icon--gif"
              : "es-done-file-icon es-done-file-icon--webm"
          }
          aria-hidden="true"
        >
          {isGif ? "GIF" : "WEBM"}
        </div>
        <div className="es-done-file-main">
          <div className="es-done-file-name">{info.fileName}</div>
          <div className="es-done-file-meta">{info.metaLine}</div>
        </div>
      </div>
    </>
  );
}

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

  const [gifFps, setGifFps] = useState(12);
  const [gifLongEdge, setGifLongEdge] = useState(480);
  const [gifDuration, setGifDuration] = useState(4);
  const [gifDither, setGifDither] = useState(true);
  const [webmFps, setWebmFps] = useState(30);
  const [recordDone, setRecordDone] = useState<RecordDoneInfo | null>(null);

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
    const s = useGraphStore.getState();
    const html = buildExportedHtml(
      { nodes: s.nodes, edges: s.edges },
      s.positions,
    );
    // `rev` genuinely drives this recompute (see comment above) — touch it
    // directly so it reads as a real dependency, not just a list entry.
    void rev;
    return Math.max(1, Math.round(html.length / 1024));
  }, [rev]);

  if (!open) return null;

  const canvas = viewportCanvas();
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
    );
    setHtmlDoneName(savedName);
    toast.success(`Exported ${savedName} · ${sizeKB} KB`);
    setPhase("done");
  };

  const handleCreateLink = async () => {
    const s = useGraphStore.getState();
    try {
      const url = await encodeShareUrl(
        { nodes: s.nodes, edges: s.edges },
        s.positions,
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
    if (!viewportCanvas()) return;
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
    const canvas = viewportCanvas();
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
    const a = document.createElement("a");
    a.href = url;
    a.download = recordDone.fileName;
    a.click();
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
