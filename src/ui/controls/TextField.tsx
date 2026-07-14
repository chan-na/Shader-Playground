import type { ChangeEvent } from "react";
import "./controls.css";

export interface TextFieldProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: "text" | "search";
  placeholder?: string;
  dataTestId?: string;
  id?: string;
  maxLength?: number;
  /** Switches to `var(--font-mono)` at 11px (design L257's mono value
   * input). Omit for the default UI-font 12px body text (L129's Label
   * input). */
  mono?: boolean;
  ariaLabel?: string;
}

/**
 * Native `<input>` skinned per design/Side Panel.dc.html L129 (Param label) /
 * L257 (mono value input). Kept as a real `<input>` so Playwright's
 * `fill()` keeps working against `data-testid="uniform-search"` and the
 * other native-input consumers.
 */
export function TextField({
  value,
  onChange,
  type = "text",
  placeholder,
  dataTestId,
  id,
  maxLength,
  mono = false,
  ariaLabel,
}: TextFieldProps) {
  return (
    <input
      id={id}
      type={type}
      className={mono ? "ctl-text ctl-text--mono" : "ctl-text"}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      onChange={onChange}
    />
  );
}
