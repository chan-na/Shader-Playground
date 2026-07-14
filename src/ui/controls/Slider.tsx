import type { CSSProperties } from "react";
import "./controls.css";

/** CSS custom properties `.ctl-slider-input` reads for its fill gradient
 * (see controls.css). Declared explicitly so they can be set on `style`
 * without an `as` cast — CSSProperties has no index signature for
 * arbitrary `--*` custom properties. */
export interface SliderCssVars extends CSSProperties {
  "--ctl-fill"?: string;
  "--ctl-fill-color"?: string;
}

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** Renders the min/max caption row below the track (design/Side
   * Panel.dc.html L86). */
  showRange?: boolean;
  /** "sm" switches the track to the 5px multi-axis height (L107-108)
   * instead of the primary 6px slider (L85). */
  size?: "md" | "sm";
  /** Per-axis fill color override (MultiSlider's AXIS_META). Falls back
   * to var(--accent-default) via the CSS custom property default. */
  fillColor?: string;
  disabled?: boolean;
  ariaLabel?: string;
  dataTestId?: string;
  id?: string;
}

/** Clamp the filled portion of the track to 0-100%. A degenerate
 * `max <= min` range (or a value at/below min) renders an empty track
 * instead of dividing by zero or over/under-filling. */
function fillPercent(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return 0;
  const pct = ((value - min) / range) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  showRange = false,
  size = "md",
  fillColor,
  disabled = false,
  ariaLabel,
  dataTestId,
  id,
}: SliderProps) {
  const style: SliderCssVars = {
    "--ctl-fill": `${fillPercent(value, min, max)}%`,
    ...(fillColor !== undefined ? { "--ctl-fill-color": fillColor } : {}),
  };

  return (
    <div className={size === "sm" ? "ctl-slider ctl-slider--sm" : "ctl-slider"}>
      <input
        id={id}
        type="range"
        className="ctl-slider-input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={dataTestId}
        style={style}
        onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
      />
      {showRange && (
        <div className="ctl-slider-range">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}
