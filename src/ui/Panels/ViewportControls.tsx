import { useGpuTimerStore } from "../../state/gpuTimerStore";
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
  const background = useViewportStore((s) => s.background);
  const setBackground = useViewportStore((s) => s.setBackground);

  const gpuSupported = useGpuTimerStore((s) => s.supported);
  const gpuEnabled = useGpuTimerStore((s) => s.enabled);
  const toggleGpu = useGpuTimerStore((s) => s.toggleEnabled);

  return (
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
        <span style={{ color: "#888", fontFamily: "monospace", fontSize: 11 }}>
          {background.map((x) => x.toFixed(2)).join(", ")}
        </span>
      </div>
      <div className="inspector-row">
        <span style={{ width: 56, color: "#888", fontSize: 11 }}>
          GPU timer
        </span>
        {gpuSupported ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#aaa",
              fontSize: 11,
            }}
          >
            <input
              type="checkbox"
              checked={gpuEnabled}
              onChange={toggleGpu}
              data-testid="gpu-timer-toggle"
            />
            {gpuEnabled ? "on" : "off"}
          </label>
        ) : (
          <span
            style={{ color: "#666", fontSize: 11 }}
            data-testid="gpu-timer-unsupported"
          >
            unavailable
          </span>
        )}
      </div>
    </div>
  );
}
