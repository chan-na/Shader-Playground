import { useCameraStore } from "../../state/cameraStore";
import { useTimeStore } from "../../state/timeStore";
import { tokens, withAlpha } from "../../theme";

/** Playback speed presets cycled by the transport bar's speed button
 * (design/Viewport.dc.html L120 + L268/L284 `cycleSpeed`). */
const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

/**
 * Index of the SPEEDS entry closest to `speed`. A plain `indexOf` would miss
 * whenever the store's speed doesn't exactly equal one of the presets, so we
 * fall back to nearest-match by absolute distance.
 */
function nearestSpeedIndex(speed: number): number {
  return SPEEDS.reduce<{ idx: number; diff: number }>(
    (best, s, i) => {
      const diff = Math.abs(s - speed);
      return diff < best.diff ? { idx: i, diff } : best;
    },
    { idx: 0, diff: Number.POSITIVE_INFINITY },
  ).idx;
}

/** The preset that follows `speed`'s nearest match, wrapping around. */
function nextSpeed(speed: number): number {
  const idx = nearestSpeedIndex(speed);
  const candidate = SPEEDS[(idx + 1) % SPEEDS.length];
  return candidate ?? SPEEDS[0];
}

/**
 * Bottom-center floating transport bar for playback + camera controls
 * (design/Viewport.dc.html L107-135, M3-U3). Hosts the Time/Camera controls
 * that previously lived in the Inspector's `ViewportControls` side panel —
 * moved here so the transport sits directly over the render it scrubs. The
 * underlying store wiring (timeStore/cameraStore) is unchanged.
 */
export function TransportBar() {
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

  const fovDeg = (camera.fov * 180) / Math.PI;

  return (
    <div
      className="vp-transport"
      style={{ background: withAlpha(tokens.surface.app, 0.86) }}
    >
      <button
        type="button"
        className="vp-transport-play"
        onClick={() => setPlaying(!playing)}
        title={playing ? "Pause (Space)" : "Play (Space)"}
        data-testid="time-playpause"
      >
        {playing ? "‖" : "▶"}
      </button>
      <button
        type="button"
        className="vp-transport-reset-time"
        onClick={() => resetTime()}
        title="Reset time"
      >
        ⏮
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
        className="vp-transport-reset-cam"
        onClick={() => resetCamera()}
        title="Reset camera"
      >
        ⟲ Reset
      </button>
    </div>
  );
}
