export type UniformValue = number | number[];

/**
 * Strict equality for uniform values:
 * - numbers compare with `===`
 * - arrays compare element-wise (NaN counts as unequal — same as `===`)
 * - mixed scalar/array always unequal
 *
 * Used by execute.ts to decide whether a uniform's value has actually changed
 * since the last GPU upload for this pass. False negatives (reporting equal
 * when actually different) would cause stale uniforms on the GPU, so the
 * comparison stays strict — no epsilon, no shallow tricks.
 */
export function uniformValuesEqual(
  a: UniformValue | undefined,
  b: UniformValue,
): boolean {
  if (a === undefined) return false;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

/**
 * Snapshot a uniform value into an independent copy so future mutations of
 * the source (uncommon, but possible via in-place edits) do not alias the
 * cached comparison key.
 */
export function snapshotUniformValue(v: UniformValue): UniformValue {
  return typeof v === "number" ? v : [...v];
}
