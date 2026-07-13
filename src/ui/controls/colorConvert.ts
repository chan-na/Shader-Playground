/**
 * RGB (0..1 float, e.g. shader uniform color) <-> hex string conversions
 * shared by the controls library. Same clamp/rounding semantics as the
 * private copies in src/ui/NodeEditor/nodes/ValueInput.tsx,
 * src/ui/Panels/ParamInspector.tsx and src/ui/Panels/ViewportControls.tsx
 * (out-of-range channels clamp to [0,1], missing channels read as 0) —
 * consolidated here for ColorField in M5-U1. The other three call sites
 * keep their own copies until M5-U3 folds them onto this module too.
 */
export function rgbToHex(rgb: readonly number[]): string {
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
