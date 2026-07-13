import { tokens } from "../../theme";
import { NumberField } from "./NumberField";
import { Slider } from "./Slider";
import "./controls.css";

export interface MultiSliderProps {
  values: number[];
  min: number;
  max: number;
  step: number;
  onChange: (next: number[]) => void;
}

/**
 * Per-axis label + fill color, up to 4 components (vec2..vec4).
 * design/Side Panel.dc.html L107-108 (vec2 X/Y) and L246-248 (vec3
 * X/Y/Z) fix X=semantic.error, Y=portFamily.scalar, Z=accent.default.
 * Neither mock includes a vec4 example, so W extends the same sequence
 * to portFamily.resource — the 4th of the brief's 4 port-type families,
 * keeping the axis palette and the port-color palette in step.
 * Intentionally not exported: only MultiSlider consumes it.
 */
const AXIS_META = [
  { label: "x", color: tokens.semantic.error },
  { label: "y", color: tokens.portFamily.scalar },
  { label: "z", color: tokens.accent.default },
  { label: "w", color: tokens.portFamily.resource },
] as const;

export function MultiSlider({
  values,
  min,
  max,
  step,
  onChange,
}: MultiSliderProps) {
  return (
    <div>
      {values.map((component, i) => {
        const meta = AXIS_META[i];
        const key = meta?.label ?? `c${i}`;
        return (
          <div className="ctl-axis-row" key={key}>
            <span
              className="ctl-axis-label"
              style={{ color: meta?.color ?? "var(--text-secondary)" }}
            >
              {key}
            </span>
            <Slider
              size="sm"
              value={component}
              min={min}
              max={max}
              step={step}
              {...(meta !== undefined ? { fillColor: meta.color } : {})}
              onChange={(v) => {
                const next = values.slice();
                next[i] = v;
                onChange(next);
              }}
            />
            <NumberField
              width={48}
              value={component.toFixed(3)}
              onChange={(v) => {
                const next = values.slice();
                next[i] = v;
                onChange(next);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
