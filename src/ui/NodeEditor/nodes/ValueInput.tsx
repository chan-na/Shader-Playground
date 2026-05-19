import { useEffect, useState } from "react";

interface NumberInputProps {
  value: number;
  /** Commit handler. Fires on every accepted change so the renderer can
   * react live. Callers that want history/structural rev semantics should
   * route through their own store action (the field itself is dumb). */
  onCommit: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  label?: string;
  ariaLabel?: string;
}

/**
 * Compact, click-to-edit numeric field for inline editing inside a node
 * card. Local state mirrors the input string so partial entries like "-"
 * or "0." remain typable; the committed numeric value is pushed up only
 * when the parsed result is finite. External value changes (undo, edge
 * input override, etc.) re-sync the local string.
 *
 * The `nodrag` className keeps React Flow's pan-on-node logic from
 * swallowing the pointer drag inside the input.
 */
export function NumberField({
  value,
  onCommit,
  step = 0.01,
  min,
  max,
  precision = 3,
  label,
  ariaLabel,
}: NumberInputProps) {
  const formatted = formatNumber(value, precision);
  const [text, setText] = useState(formatted);

  // External value drift → re-sync the visible text. We only do this when
  // the parsed local value differs from the incoming value; otherwise
  // typing "0.1" into a field whose store value is 0.10 would yank the
  // cursor back to the formatted string on every keystroke.
  useEffect(() => {
    setText((prev) => {
      const prevParsed = Number.parseFloat(prev);
      if (Number.isFinite(prevParsed) && prevParsed === value) return prev;
      return formatted;
    });
  }, [formatted, value]);

  return (
    <input
      className="node-card__input nodrag"
      type="number"
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      value={text}
      aria-label={ariaLabel ?? label ?? "value"}
      onChange={(e) => {
        setText(e.target.value);
        const next = clampParse(e.target.value, min, max);
        if (next !== null && next !== value) onCommit(next);
      }}
      onBlur={(e) => {
        // Snap visible text back to the canonical formatted value on blur
        // so an abandoned partial entry ("0.") doesn't linger.
        if (!Number.isFinite(Number.parseFloat(e.target.value))) {
          setText(formatNumber(value, precision));
        }
      }}
    />
  );
}

interface ColorInputProps {
  /** Normalized RGB tuple in [0..1]. */
  value: number[];
  onCommit: (next: [number, number, number]) => void;
}

/**
 * Native `<input type="color">` wrapped so the swatch styling matches
 * the rest of the node card. Live-commits on each change.
 */
export function ColorField({ value, onCommit }: ColorInputProps) {
  return (
    <input
      className="node-card__color-input nodrag"
      type="color"
      aria-label="color"
      value={rgbToHex(value)}
      onChange={(e) => onCommit(hexToRgb(e.target.value))}
    />
  );
}

export function formatNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(precision);
}

/**
 * Parse `raw` as a finite number, clamp to optional bounds, and return
 * the result — or `null` if the input is not a finite numeric string.
 * Pure helper exported for unit-testability of the commit pipeline.
 */
export function clampParse(
  raw: string,
  min: number | undefined,
  max: number | undefined,
): number | null {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  let next = parsed;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

export function rgbToHex(rgb: number[]): string {
  const c = (x: number | undefined) =>
    Math.round(Math.max(0, Math.min(1, x ?? 0)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}
