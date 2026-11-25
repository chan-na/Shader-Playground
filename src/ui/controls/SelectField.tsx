import type { ChangeEvent, ReactNode } from "react";
import "./controls.css";

export interface SelectFieldProps {
  value: string | number;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  /** `<option>` elements, passed through untouched (caller keeps full
   * control over the option list — RESOLUTION_SCALES.map(...), etc.). */
  children: ReactNode;
  dataTestId?: string;
  id?: string;
  ariaLabel?: string;
}

/**
 * Native `<select>` skinned per design/Side Panel.dc.html's selects
 * (u_blendMode, webcam Device, output Resolution). Kept as a real
 * `<select>` — not a custom listbox — so Playwright's `selectOption()` keeps
 * working against `data-testid="resolution-scale"` (phase-17).
 */
export function SelectField({
  value,
  onChange,
  children,
  dataTestId,
  id,
  ariaLabel,
}: SelectFieldProps) {
  return (
    <div className="ctl-select-wrap">
      <select
        id={id}
        className="ctl-select"
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        data-testid={dataTestId}
      >
        {children}
      </select>
      <span className="ctl-select-caret" aria-hidden="true">
        ▾
      </span>
    </div>
  );
}
