export type UniformValue =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number]
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
    switch (value.length) {
      case 2:
        gl.uniform2f(loc, value[0], value[1]);
        return;
      case 3:
        gl.uniform3f(loc, value[0], value[1], value[2]);
        return;
      case 4:
        gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
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
