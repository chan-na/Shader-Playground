import "./controls.css";

export interface NumberFieldProps {
  value: string | number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Fixed pixel width (MultiSlider's 48px value chip). Omit for the
   * default 64px used standalone in UniformControl's scalar row. */
  width?: number;
  dataTestId?: string;
  ariaLabel?: string;
  id?: string;
}

/** Native numeric input skinned per design/Side Panel.dc.html L257.
 * `onChange` preserves UniformControl's original semantic: an
 * unparseable string commits `0` rather than being ignored. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  width,
  dataTestId,
  ariaLabel,
  id,
}: NumberFieldProps) {
  return (
    <input
      id={id}
      type="number"
      className="ctl-number"
      value={value}
      min={min}
      max={max}
      step={step}
      style={width !== undefined ? { width } : undefined}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
    />
  );
}
