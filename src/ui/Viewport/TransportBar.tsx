import { useCameraStore } from "../../state/cameraStore";
import { useRendererStore } from "../../state/rendererStore";
import { useTimeStore } from "../../state/timeStore";
import { tokens, withAlpha } from "../../theme";

/** Playback speed presets cycled by the transport bar's speed button
 * (design/Viewport.dc.html L120 + L268/L284 `cycleSpeed`). */
const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

/** 컴팩트 변형의 FOV 탭 순환 프리셋 (deg) — design/Viewport.dc.html L310 [D3]. */
const FOV_PRESETS = [35, 55, 75, 90] as const;

/**
 * Index of the `values` entry closest to `target`. A plain `indexOf` would
 * miss whenever the store's value doesn't exactly equal one of the presets,
 * so we fall back to nearest-match by absolute distance.
 */
function nearestIndex(values: readonly number[], target: number): number {
  return values.reduce<{ idx: number; diff: number }>(
    (best, v, i) => {
      const diff = Math.abs(v - target);
      return diff < best.diff ? { idx: i, diff } : best;
    },
    { idx: 0, diff: Number.POSITIVE_INFINITY },
  ).idx;
}

/** The preset that follows `speed`'s nearest match, wrapping around. */
function nextSpeed(speed: number): number {
  const idx = nearestIndex(SPEEDS, speed);
  const candidate = SPEEDS[(idx + 1) % SPEEDS.length];
  return candidate ?? SPEEDS[0];
}

/**
 * The FOV preset that follows `fovDeg`'s nearest match, wrapping around
 * (dc's `stepFov` uses a plain `indexOf`, which resolves to -1 — and then
 * wraps to the *last* preset — whenever the camera's FOV isn't exactly one
 * of the four taps; nearest-match keeps the cycle well-defined from any
 * FOV the full-variant slider left behind).
 */
function nextFovDeg(fovDeg: number): number {
  const idx = nearestIndex(FOV_PRESETS, fovDeg);
  const candidate = FOV_PRESETS[(idx + 1) % FOV_PRESETS.length];
  return candidate ?? FOV_PRESETS[0];
}

/**
 * Bottom-center floating transport bar for playback + camera controls
 * (design/Viewport.dc.html L107-135, M3-U3). Hosts the Time/Camera controls
 * that previously lived in the Inspector's `ViewportControls` side panel —
 * moved here so the transport sits directly over the render it scrubs. The
 * underlying store wiring (timeStore/cameraStore) is unchanged.
 *
 * Self-gates to `panes.length === 0` (M7-U4): none of System States.dc.html's
 * empty/loading/compile-error/webcam-permission mocks show this bar, and
 * concretely, the bar's floating `z-index` used to sit above
 * CompileErrorOverlay's action row regardless of DOM order, making its
 * "Jump to line"/"Copy log" buttons pointer-unreachable whenever a shader
 * error dropped every drawable pane. Gating on the same `panes.length === 0`
 * condition CompileErrorOverlay/EmptyState already use for their own mount
 * makes the two mutually exclusive by construction rather than by
 * z-index arithmetic.
 *
 * Renders a single DOM tree that covers both the full (design/Viewport.dc.html
 * L108-136) and compact (L141-152, [D3]) transport bar variants — the switch
 * between them is a `@container vp-body (max-width: 700px)` query in
 * index.css, not a second JSX branch, so there's exactly one set of
 * testid/state hooks regardless of panel width. The compact variant hides
 * the scrub + FOV sliders and the u_time/Reset-camera text labels, and swaps
 * in the `camera-fov-step` stepper button (cycling `FOV_PRESETS`) in place of
 * the FOV slider — same store wiring, just a narrower rendering of it.
 */
export function TransportBar() {
  const panes = useRendererStore((s) => s.panes);
  const simTime = useTimeStore((s) => s.simTime);
  const playing = useTimeStore((s) => s.playing);
  const speed = useTimeStore((s) => s.speed);
  const setPlaying = useTimeStore((s) => s.setPlaying);
  const setSpeed = useTimeStore((s) => s.setSpeed);
  const setTime = useTimeStore((s) => s.setTime);
  const resetTime = useTimeStore((s) => s.reset);

  const camera = useCameraStore((s) => s.camera);
  const setCamera = useCameraStore((s) => s.setCamera);
  const resetCamera = useCameraStore((s) => s.reset);

  if (panes.length === 0) return null;

  const fovDeg = (camera.fov * 180) / Math.PI;

  return (
    <div
      className="vp-transport"
      style={{ background: withAlpha(tokens.surface.app, 0.86) }}
    >
      <button
        type="button"
        className="vp-transport-reset-time"
        onClick={() => resetTime()}
        title="Reset time"
      >
        ⏮
      </button>
      <button
        type="button"
        className="vp-transport-play"
        onClick={() => setPlaying(!playing)}
        title={playing ? "Pause (Space)" : "Play (Space)"}
        data-testid="time-playpause"
      >
        {playing ? "‖" : "▶"}
      </button>
      <div className="vp-transport-time">
        <span className="vp-transport-label">u_time</span>
        <span className="vp-transport-value">{`${simTime.toFixed(2)}s`}</span>
        <input
          type="range"
          className="vp-transport-scrub"
          min={0}
          max={30}
          step={0.01}
          value={Math.min(simTime, 30)}
          onChange={(e) => setTime(parseFloat(e.target.value))}
          data-testid="time-scrub"
        />
      </div>
      <button
        type="button"
        className="vp-transport-speed"
        onClick={() => setSpeed(nextSpeed(speed))}
        data-testid="time-speed"
      >
        {`${speed}×`}
      </button>
      <div className="vp-transport-divider" />
      <div className="vp-transport-fov-group">
        <span className="vp-transport-label">FOV</span>
        <input
          type="range"
          className="vp-transport-fov"
          min={10}
          max={120}
          step={1}
          value={fovDeg}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setCamera({ ...camera, fov: (v * Math.PI) / 180 });
          }}
          data-testid="camera-fov"
        />
        <span className="vp-transport-fov-value">{`${fovDeg.toFixed(0)}°`}</span>
      </div>
      <button
        type="button"
        className="vp-transport-fov-step"
        onClick={() =>
          setCamera({ ...camera, fov: (nextFovDeg(fovDeg) * Math.PI) / 180 })
        }
        title="Cycle FOV preset"
        data-testid="camera-fov-step"
      >
        {`FOV ${fovDeg.toFixed(0)}°`}
      </button>
      <button
        type="button"
        className="vp-transport-reset-cam"
        onClick={() => resetCamera()}
        title="Reset camera"
      >
        <span aria-hidden="true">⟲</span>
        <span className="vp-transport-reset-cam-text">Reset</span>
      </button>
    </div>
  );
}
