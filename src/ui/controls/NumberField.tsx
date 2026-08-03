import { useEffect, useState } from "react";
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
  disabled?: boolean;
}

/** Native numeric input skinned per design/Side Panel.dc.html L257.
 *
 * [#14] The visible text is a local draft, not a direct binding to `value`.
 * Callers hand us a formatted string (`num.toFixed(3)`) derived from what we
 * last committed, so committing an unparseable entry would immediately bounce
 * a formatted number back down and wipe what the user was typing: entering
 * `-5` meant typing `-`, having it commit `0` and re-render as `0.000`, and
 * never reaching the `5`. Partial entries (`-`, `0.`, ``) are therefore *not*
 * committed — they are held in the draft, and the store keeps its previous
 * value until the text parses as a finite number. Blur snaps an abandoned
 * partial back to `value`.
 *
 * This replaces the field's original "an unparseable string commits 0"
 * semantic, which existed only as a side effect of `parseFloat(x) || 0` and
 * was the defect itself. To zero a value, type `0`.
 *
 * `<input type="number">` sanitizes its own `value` to `""` while the text is
 * not a valid floating-point number, so `-` and `0.` both arrive here as `""`
 * — the draft's job is to make sure we hand that `""` straight back instead of
 * a formatted number, which is what lets the browser keep showing the
 * in-progress text.
 */
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
  disabled = false,
}: NumberFieldProps) {
  const external = typeof value === "number" ? String(value) : value;
  const [draft, setDraft] = useState(external);

  // External drift (slider drag, undo, node switch) re-syncs the draft — but
  // only when it actually disagrees numerically, so committing `1.7` and
  // getting `"1.700"` back doesn't yank the caret mid-word.
  useEffect(() => {
    setDraft((prev) => {
      const prevNum = Number.parseFloat(prev);
      const nextNum = Number.parseFloat(external);
      if (Number.isFinite(prevNum) && prevNum === nextNum) return prev;
      return external;
    });
  }, [external]);

  return (
    <input
      id={id}
      type="number"
      className="ctl-number"
      value={draft}
      min={min}
      max={max}
      step={step}
      style={width !== undefined ? { width } : undefined}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() =>
        setDraft((prev) =>
          Number.isFinite(Number.parseFloat(prev)) ? prev : external,
        )
      }
    />
  );
}
