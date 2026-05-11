import { mat4 } from 'gl-matrix';
import { bindFramebuffer } from '../gl/framebuffer';
import { drawMesh } from '../gl/mesh';
import { setUniform } from '../gl/uniforms';
import type { ExecutionPlan, ShaderPass } from './compile';
import {
  modelMatrix,
  projMatrix,
  viewMatrix,
  type OrbitCameraState,
} from '../camera/orbitCamera';

export interface FrameContext {
  time: number;
  width: number;
  height: number;
  camera: OrbitCameraState;
  /** Background color shown by the placeholder/empty pass. */
  background?: [number, number, number];
}

const _view = mat4.create();
const _proj = mat4.create();
const _model = mat4.create();

function bindSystemUniforms(
  gl: WebGL2RenderingContext,
  pass: ShaderPass,
  ctx: FrameContext,
) {
  const u = pass.program.uniforms;
  setUniform(gl, u['u_time'] ?? null, ctx.time);
  setUniform(gl, u['u_resolution'] ?? null, [ctx.width, ctx.height]);
  if (!pass.meshIsFullscreen) {
    viewMatrix(ctx.camera, _view);
    projMatrix(ctx.camera, ctx.width / Math.max(1, ctx.height), _proj);
    modelMatrix(_model);
    setUniform(gl, u['u_view'] ?? null, _view as Float32Array);
    setUniform(gl, u['u_proj'] ?? null, _proj as Float32Array);
    setUniform(gl, u['u_model'] ?? null, _model as Float32Array);
  }
}

function bindUserUniforms(gl: WebGL2RenderingContext, pass: ShaderPass) {
  for (const [name, value] of Object.entries(pass.uniformValues)) {
    const loc = pass.program.uniforms[name];
    if (loc === undefined) continue;
    if (typeof value === 'number') {
      setUniform(gl, loc ?? null, value);
    } else if (Array.isArray(value)) {
      if (value.length === 2) setUniform(gl, loc ?? null, [value[0], value[1]]);
      else if (value.length === 3) setUniform(gl, loc ?? null, [value[0], value[1], value[2]]);
      else if (value.length === 4) setUniform(gl, loc ?? null, [value[0], value[1], value[2], value[3]]);
    }
  }
}

function bindSamplers(
  gl: WebGL2RenderingContext,
  pass: ShaderPass,
  passByNode: Map<string, ShaderPass>,
  plan: ExecutionPlan,
) {
  for (const s of pass.samplers) {
    let texture: WebGLTexture | null = null;
    const src = passByNode.get(s.sourceNodeId);
    if (src) {
      texture = src.fbo.color.texture;
    } else {
      const img = plan.imageTextures[s.sourceNodeId];
      if (img) texture = img.texture;
    }
    if (!texture) continue;
    const loc = pass.program.uniforms[s.uniformName];
    if (loc === undefined) continue;
    setUniform(gl, loc ?? null, {
      kind: 'sampler2D',
      texture,
      unit: s.unit,
    });
  }
}

export function executePlan(
  gl: WebGL2RenderingContext,
  plan: ExecutionPlan,
  ctx: FrameContext,
  canvasWidth: number,
  canvasHeight: number,
) {
  const passByNode = new Map<string, ShaderPass>();
  for (const p of plan.passes) passByNode.set(p.nodeId, p);

  // Render each shader node into its FBO
  for (const pass of plan.passes) {
    bindFramebuffer(gl, pass.fbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (pass.meshIsFullscreen) {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
    }
    gl.useProgram(pass.program.program);
    bindSystemUniforms(gl, pass, ctx);
    bindUserUniforms(gl, pass);
    bindSamplers(gl, pass, passByNode, plan);
    drawMesh(gl, pass.mesh);
  }

  // Composite to canvas
  bindFramebuffer(gl, null);
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  const bg = ctx.background ?? [0.07, 0.07, 0.09];
  if (plan.outputSourceNodeId && passByNode.has(plan.outputSourceNodeId)) {
    // Clear with background first so any transparent shader output composites
    // over the user's chosen background instead of black.
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const src = passByNode.get(plan.outputSourceNodeId)!;
    blitToCanvas(gl, src.fbo.color.texture);
  } else {
    drawPlaceholder(gl, bg);
  }
}

let _blitProgram: WebGLProgram | null = null;
let _blitVAO: WebGLVertexArrayObject | null = null;
let _blitTexLoc: WebGLUniformLocation | null = null;

function ensureBlit(gl: WebGL2RenderingContext) {
  if (_blitProgram) return;
  const vs = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
  const fs = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, v_uv);
}`;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  _blitProgram = p;
  _blitTexLoc = gl.getUniformLocation(p, 'u_tex');
  const loc = gl.getAttribLocation(p, 'a_position');
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  _blitVAO = vao;
}

function blitToCanvas(gl: WebGL2RenderingContext, tex: WebGLTexture) {
  ensureBlit(gl);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(_blitProgram);
  gl.bindVertexArray(_blitVAO);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(_blitTexLoc, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}

function drawPlaceholder(gl: WebGL2RenderingContext, bg: [number, number, number]) {
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
