import "./controls.css";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  dataTestId?: string;
}

/** Pill switch (design/Side Panel.dc.html L121 off / L232 on). A native
 * `role="switch"` button rather than a checkbox so `aria-checked` alone
 * drives both the accessible state and the CSS knob position/color. */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  dataTestId,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="ctl-toggle"
      disabled={disabled}
      data-testid={dataTestId}
      onClick={() => onChange(!checked)}
    >
      <span className="ctl-toggle-knob" aria-hidden="true" />
    </button>
  );
}
