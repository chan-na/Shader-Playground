import type { ParamGraphNode } from "../../../core/graph/types";

/**
 * Render a param node's current value as a compact string for the node card.
 * Time params apply scale/offset to the supplied simTime; scalar/vec values
 * fall through to fixed-precision text.
 */
export function formatParamValue(node: ParamGraphNode, time: number): string {
  if (node.paramKind === "time") {
    const [scale = 1, offset = 0] = Array.isArray(node.value)
      ? node.value
      : [node.value as number, 0];
    const t = time * scale + offset;
    return `${t.toFixed(2)} (×${scale}+${offset})`;
  }
  const v = node.value;
  if (Array.isArray(v)) return v.map((x) => x.toFixed(2)).join(", ");
  return (v as number).toFixed(3);
}

/**
 * Convert a normalized RGB tuple (channel ∈ [0..1]) to a `#rrggbb` swatch.
 * Values outside [0..1] are clamped.
 */
export function colorSwatchHex(rgb: number[]): string {
  const c = (x: number) =>
    Math.round(Math.max(0, Math.min(1, x)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0] ?? 0)}${c(rgb[1] ?? 0)}${c(rgb[2] ?? 0)}`;
}
