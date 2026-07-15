import type { ChangeEvent, KeyboardEvent } from "react";
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
  /** Commit-on-blur hook for draft/commit fields (e.g. Inspector's Name
   * field) — omit for plain controlled inputs that don't need it. */
  onBlur?: () => void;
  /** Commit/cancel-on-key hook (Enter/Escape) for draft/commit fields —
   * omit for plain controlled inputs that don't need it. */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
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
  onBlur,
  onKeyDown,
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
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
