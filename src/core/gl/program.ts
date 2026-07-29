import { checkGlError } from "./glError";

export interface ShaderError {
  stage: "vertex" | "fragment" | "link";
  line?: number;
  column?: number;
  message: string;
  raw: string;
}

export interface CompiledProgram {
  program: WebGLProgram;
  attributes: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
  /**
   * Reflected GLSL type enum per uniform (GL_FLOAT, GL_INT, GL_FLOAT_VEC2, …),
   * keyed by the same array-subscript-stripped name as `uniforms`. The upload
   * path needs it to pick the int vs float entry point — `uniform1f` against an
   * `int` location is INVALID_OPERATION in WebGL2. (#11)
   */
  uniformTypes: Record<string, number>;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): { shader: WebGLShader | null; error?: ShaderError } {
  const shader = gl.createShader(type);
  if (!shader) {
    return {
      shader: null,
      error: { stage: "link", message: "createShader returned null", raw: "" },
    };
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    return {
      shader: null,
      error: {
        stage: type === gl.VERTEX_SHADER ? "vertex" : "fragment",
        message: log,
        raw: log,
      },
    };
  }
  return { shader };
}

/**
 * Shared tail for both program builders: link check, GL-error drain, and the
 * active-attribute / active-uniform reflection loops. Extracted because the two
 * builders carried byte-identical copies of it — a fix applied to only one of
 * them still type-checks, so "works for shader nodes but not compute nodes"
 * was a silent failure mode (the reflection now records `info.type` in exactly
 * one place). `label` stays a parameter so each caller keeps its own name in
 * the GL error log. (#40)
 */
function finishProgram(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  errors: ShaderError[],
  label: string,
): { program: CompiledProgram | null; errors: ShaderError[] } {
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "";
    gl.deleteProgram(prog);
    return {
      program: null,
      errors: [...errors, { stage: "link", message: log, raw: log }],
    };
  }
  checkGlError(gl, label);

  const attributes: Record<string, number> = {};
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const uniformTypes: Record<string, number> = {};

  const numAttribs = gl.getProgramParameter(
    prog,
    gl.ACTIVE_ATTRIBUTES,
  ) as number;
  for (let i = 0; i < numAttribs; i++) {
    const info = gl.getActiveAttrib(prog, i);
    if (!info) continue;
    attributes[info.name] = gl.getAttribLocation(prog, info.name);
  }

  const numUniforms = gl.getProgramParameter(
    prog,
    gl.ACTIVE_UNIFORMS,
  ) as number;
  for (let i = 0; i < numUniforms; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const baseName = info.name.replace(/\[\d+\]$/, "");
    uniforms[baseName] = gl.getUniformLocation(prog, info.name);
    uniformTypes[baseName] = info.type;
  }

  return {
    program: { program: prog, attributes, uniforms, uniformTypes },
    errors,
  };
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): { program: CompiledProgram | null; errors: ShaderError[] } {
  const errors: ShaderError[] = [];
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  if (vs.error) errors.push(vs.error);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (fs.error) errors.push(fs.error);
  if (!vs.shader || !fs.shader) {
    if (vs.shader) gl.deleteShader(vs.shader);
    if (fs.shader) gl.deleteShader(fs.shader);
    return { program: null, errors };
  }

  const prog = gl.createProgram();
  if (!prog) {
    return {
      program: null,
      errors: [
        { stage: "link", message: "createProgram returned null", raw: "" },
      ],
    };
  }
  gl.attachShader(prog, vs.shader);
  gl.attachShader(prog, fs.shader);
  gl.linkProgram(prog);
  gl.deleteShader(vs.shader);
  gl.deleteShader(fs.shader);

  return finishProgram(gl, prog, errors, "createProgram");
}

export function disposeProgram(gl: WebGL2RenderingContext, p: CompiledProgram) {
  gl.deleteProgram(p.program);
}

/**
 * Build a vertex+fragment program with transform feedback varyings declared
 * before linking. Used by ComputePass — `varyings` lists the GLSL `out` names
 * to capture into separated per-slot buffers (`SEPARATE_ATTRIBS`).
 */
export function createTransformFeedbackProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
  varyings: string[],
): { program: CompiledProgram | null; errors: ShaderError[] } {
  const errors: ShaderError[] = [];
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  if (vs.error) errors.push(vs.error);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (fs.error) errors.push(fs.error);
  if (!vs.shader || !fs.shader) {
    if (vs.shader) gl.deleteShader(vs.shader);
    if (fs.shader) gl.deleteShader(fs.shader);
    return { program: null, errors };
  }

  const prog = gl.createProgram();
  if (!prog) {
    return {
      program: null,
      errors: [
        { stage: "link", message: "createProgram returned null", raw: "" },
      ],
    };
  }
  gl.attachShader(prog, vs.shader);
  gl.attachShader(prog, fs.shader);
  if (varyings.length > 0) {
    gl.transformFeedbackVaryings(prog, varyings, gl.SEPARATE_ATTRIBS);
  }
  gl.linkProgram(prog);
  gl.deleteShader(vs.shader);
  gl.deleteShader(fs.shader);

  return finishProgram(gl, prog, errors, "createTransformFeedbackProgram");
}
