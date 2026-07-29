/**
 * Vectors are typed as plain `number[]` rather than fixed-length tuples: the
 * callers hold long-lived scratch arrays (execute.ts `_mouse`) and store-shaped
 * `number[]` values, and tuple parameters forced every one of them to re-box
 * into a fresh literal on the RAF hot path just to satisfy the type. Length is
 * dispatched at runtime instead; an array whose length has no vector entry
 * point (0, 1, 5+) is a no-op, as before.
 */
export type UniformValue =
  | number
  | number[]
  | Float32Array
  | { kind: "sampler2D"; texture: WebGLTexture; unit: number };

export function setUniform(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  value: UniformValue,
) {
  if (loc === null) return;
  if (typeof value === "number") {
    gl.uniform1f(loc, value);
    return;
  }
  if (value instanceof Float32Array) {
    if (value.length === 16) gl.uniformMatrix4fv(loc, false, value);
    else if (value.length === 9) gl.uniformMatrix3fv(loc, false, value);
    else if (value.length === 4) gl.uniform4fv(loc, value);
    else if (value.length === 3) gl.uniform3fv(loc, value);
    else if (value.length === 2) gl.uniform2fv(loc, value);
    else if (value.length === 1) gl.uniform1fv(loc, value);
    return;
  }
  if (Array.isArray(value)) {
    // `?? 0` only satisfies noUncheckedIndexedAccess — each case is already
    // guarded by the length it switches on.
    switch (value.length) {
      case 2:
        gl.uniform2f(loc, value[0] ?? 0, value[1] ?? 0);
        return;
      case 3:
        gl.uniform3f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
        return;
      case 4:
        gl.uniform4f(
          loc,
          value[0] ?? 0,
          value[1] ?? 0,
          value[2] ?? 0,
          value[3] ?? 0,
        );
        return;
    }
    return;
  }
  if (
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "sampler2D"
  ) {
    gl.activeTexture(gl.TEXTURE0 + value.unit);
    gl.bindTexture(gl.TEXTURE_2D, value.texture);
    gl.uniform1i(loc, value.unit);
    return;
  }
}
