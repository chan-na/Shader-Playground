import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useViewportStore } from "../../state/viewportStore";
import { ColorField } from "../controls/ColorField";
import { Toggle } from "../controls/Toggle";

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
        <span style={{ width: 56, color: "var(--text-muted)", fontSize: 11 }}>
          Background
        </span>
        <ColorField
          rgb={background}
          onChange={(next) =>
            setBackground([next[0] ?? 0, next[1] ?? 0, next[2] ?? 0])
          }
          dataTestId="bg-color"
        />
      </div>
      <div className="inspector-row">
        <span style={{ width: 56, color: "var(--text-muted)", fontSize: 11 }}>
          GPU timer
        </span>
        {gpuSupported ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Toggle
              checked={gpuEnabled}
              onChange={toggleGpu}
              ariaLabel="GPU timer"
              dataTestId="gpu-timer-toggle"
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {gpuEnabled ? "on" : "off"}
            </span>
          </div>
        ) : (
          <span
            style={{ color: "var(--text-muted)", fontSize: 11 }}
            data-testid="gpu-timer-unsupported"
          >
            unavailable
          </span>
        )}
      </div>
    </div>
  );
}
