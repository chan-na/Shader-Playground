/**
 * Presentational pieces of the Export & Share dialog — rail nav, footers and
 * the per-target Configure / Recording / Encoding / Done panels. Stateless:
 * every value and callback comes in through props from ExportShareDialog.
 */
import type { ExportTarget } from "../../state/exportShareStore";
import { SegmentedControl } from "../controls/SegmentedControl";
import { Slider } from "../controls/Slider";
import { TextField } from "../controls/TextField";
import { Toggle } from "../controls/Toggle";
import {
  estimateGifSizeMB,
  GIF_FPS_OPTIONS,
  GIF_SIZE_OPTIONS,
  type RecordDoneInfo,
  WEBM_FPS_OPTIONS,
} from "./recordConfig";

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

export function RailNav({
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

export function ConfigureFooter({
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
export function BusyFooter({
  label,
  onStop,
}: {
  label: string;
  onStop: () => void;
}) {
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

export function HtmlConfigurePanel({
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

export function LinkConfigurePanel() {
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

export function GifConfigurePanel({
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

export function WebmConfigurePanel({
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
export function RecordingPanel({
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
 * footer is a plain note instead of a button (see the encoding footer in
 * ExportShareDialog). */
export function EncodingPanel({ progress }: { progress: number }) {
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

export function DoneHtmlPanel({
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

export function DoneLinkPanel({
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

export function DoneRecordPanel({ info }: { info: RecordDoneInfo }) {
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
