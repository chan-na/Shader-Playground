import { useCameraStore } from "../../state/cameraStore";
import { useTimeStore } from "../../state/timeStore";
import { useViewportStore } from "../../state/viewportStore";

function rgbToHex(rgb: [number, number, number]) {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

export function ViewportControls() {
  const camera = useCameraStore((s) => s.camera);
  const setCamera = useCameraStore((s) => s.setCamera);
  const resetCamera = useCameraStore((s) => s.reset);

  const time = useTimeStore((s) => s.simTime);
  const playing = useTimeStore((s) => s.playing);
  const speed = useTimeStore((s) => s.speed);
  const setPlaying = useTimeStore((s) => s.setPlaying);
  const setSpeed = useTimeStore((s) => s.setSpeed);
  const setTime = useTimeStore((s) => s.setTime);
  const resetTime = useTimeStore((s) => s.reset);

  const background = useViewportStore((s) => s.background);
  const setBackground = useViewportStore((s) => s.setBackground);

  const fovDeg = (camera.fov * 180) / Math.PI;

  return (
    <>
      <div className="inspector-section">
        <div className="inspector-label">
          <span>Time</span>
          <span style={{ color: "#666" }}>{time.toFixed(2)}s</span>
        </div>
        <div className="inspector-row">
          <button
            className="btn-small"
            onClick={() => setPlaying(!playing)}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            data-testid="time-playpause"
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            className="btn-small"
            onClick={() => resetTime()}
            title="Reset time"
          >
            ⏮ 0
          </button>
        </div>
        <div className="inspector-row">
          <input
            type="range"
            min={0}
            max={30}
            step={0.01}
            value={Math.min(time, 30)}
            onChange={(e) => setTime(parseFloat(e.target.value))}
            data-testid="time-scrub"
          />
          <input
            type="number"
            min={0}
            step={0.1}
            value={time.toFixed(2)}
            onChange={(e) => setTime(parseFloat(e.target.value) || 0)}
            style={{ width: 60 }}
          />
        </div>
        <div className="inspector-row">
          <span style={{ width: 36, color: "#888", fontSize: 11 }}>Speed</span>
          <input
            type="range"
            min={0}
            max={4}
            step={0.01}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            data-testid="time-speed"
          />
          <span
            style={{
              color: "#888",
              fontSize: 11,
              fontFamily: "monospace",
              width: 36,
              textAlign: "right",
            }}
          >
            {speed.toFixed(2)}×
          </span>
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-label">Camera</div>
        <div className="inspector-row">
          <button
            className="btn-small"
            onClick={() => resetCamera()}
            title="Reset camera"
          >
            ⟲ Reset camera
          </button>
        </div>
        <div className="inspector-row">
          <span style={{ width: 36, color: "#888", fontSize: 11 }}>FOV</span>
          <input
            type="range"
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
          <span
            style={{
              color: "#888",
              fontSize: 11,
              fontFamily: "monospace",
              width: 36,
              textAlign: "right",
            }}
          >
            {fovDeg.toFixed(0)}°
          </span>
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-label">Viewport</div>
        <div className="inspector-row">
          <span style={{ width: 56, color: "#888", fontSize: 11 }}>
            Background
          </span>
          <input
            type="color"
            value={rgbToHex(background)}
            onChange={(e) => setBackground(hexToRgb(e.target.value))}
            data-testid="bg-color"
          />
          <span
            style={{ color: "#888", fontFamily: "monospace", fontSize: 11 }}
          >
            {background.map((x) => x.toFixed(2)).join(", ")}
          </span>
        </div>
      </div>
    </>
  );
}
