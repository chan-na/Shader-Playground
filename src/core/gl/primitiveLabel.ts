// Pure GL-constant → human label mapping for draw-mode primitives. No WebGL
// context is required — the values below are the fixed WebGL2 enum numbers
// (gl.POINTS === 0, gl.LINES === 1, …), so this is safe to import from
// contexts that never touch a real GPU (leaf stores, UI, unit tests).
const GL_PRIMITIVE_NAMES: Record<number, string> = {
  0: "POINTS",
  1: "LINES",
  2: "LINE_LOOP",
  3: "LINE_STRIP",
  4: "TRIANGLES",
  5: "TRIANGLE_STRIP",
  6: "TRIANGLE_FAN",
};

/**
 * Human-readable name for a WebGL draw-mode constant (as stored on
 * `ComputePass.primitive`). Falls back to a hex literal for anything outside
 * the seven standard primitive modes so an unexpected value is still legible
 * rather than silently blank.
 */
export function glPrimitiveLabel(glConst: number): string {
  const name = GL_PRIMITIVE_NAMES[glConst];
  if (name !== undefined) return name;
  return `0x${glConst.toString(16)}`;
}
