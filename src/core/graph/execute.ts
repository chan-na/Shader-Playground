// biome-ignore-all lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL API, not a React hook
// biome-ignore-all lint/style/noNonNullAssertion: WebGL setup; null only on context loss, treated as fatal upstream
import { mat4 } from "gl-matrix";
import {
  modelMatrix,
  type OrbitCameraState,
  projMatrix,
  viewMatrix,
} from "../camera/orbitCamera";
import { getExternalTexture } from "../external/registry";
import { bindFramebuffer } from "../gl/framebuffer";
import { drawMesh } from "../gl/mesh";
import { setUniform } from "../gl/uniforms";
import { resolveValueFor, type Value } from "../nodes/utility";
import type { ComputePass, ExecutionPlan, Pass, ShaderPass } from "./compile";
import type { Graph, GraphNode } from "./types";
import {
  snapshotUniformValue,
  type UniformValue,
  uniformValuesEqual,
} from "./uniformCache";

export interface FrameContext {
  time: number;
  width: number;
  height: number;
  camera: OrbitCameraState;
  /** Background color shown by the placeholder/empty pass. */
  background?: [number, number, number];
  /** Snapshot of parameter-node values keyed by node ID (read each frame). */
  params?: Record<string, GraphNode>;
  /**
   * Full graph snapshot — required when math/swizzle/combine utility nodes
   * appear as upstream value sources, since their output depends on inbound
   * edges (which `params` alone does not capture).
   */
  graph?: Graph;
}

const _view = mat4.create();
const _proj = mat4.create();
const _model = mat4.create();

function bindComputeSystemUniforms(
  gl: WebGL2RenderingContext,
  pass: ComputePass,
  ctx: FrameContext,
) {
  const u = pass.program.uniforms;
  setUniform(gl, u.u_time ?? null, ctx.time);
}

function bindSystemUniforms(
  gl: WebGL2RenderingContext,
  pass: ShaderPass,
  ctx: FrameContext,
) {
  const u = pass.program.uniforms;
  setUniform(gl, u.u_time ?? null, ctx.time);
  setUniform(gl, u.u_resolution ?? null, [ctx.width, ctx.height]);
  if (!pass.meshIsFullscreen) {
    viewMatrix(ctx.camera, _view);
    projMatrix(ctx.camera, ctx.width / Math.max(1, ctx.height), _proj);
    modelMatrix(_model);
    setUniform(gl, u.u_view ?? null, _view as Float32Array);
    setUniform(gl, u.u_proj ?? null, _proj as Float32Array);
    setUniform(gl, u.u_model ?? null, _model as Float32Array);
  }
}

/**
 * Per-pass cache of the last user-uniform values uploaded to the GPU. Keyed
 * weakly on the Pass object, so when `compile` rebuilds the plan the previous
 * Pass + its cache are GC'd together — the new Pass starts with an empty cache
 * (first frame after recompile re-uploads everything, which is correct).
 *
 * Programs are not shared across passes (each ShaderPass calls createProgram),
 * so a per-pass cache faithfully reflects what is in each program's uniform
 * state without cross-talk.
 */
const userUniformCache = new WeakMap<
  ShaderPass | ComputePass,
  Map<string, UniformValue>
>();

function uploadUniform(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  value: UniformValue,
) {
  if (typeof value === "number") {
    setUniform(gl, loc, value);
    return;
  }
  if (value.length === 2) {
    setUniform(gl, loc, [value[0]!, value[1]!]);
  } else if (value.length === 3) {
    setUniform(gl, loc, [value[0]!, value[1]!, value[2]!]);
  } else if (value.length === 4) {
    setUniform(gl, loc, [value[0]!, value[1]!, value[2]!, value[3]!]);
  }
}

function bindUserUniforms(
  gl: WebGL2RenderingContext,
  pass: ShaderPass | ComputePass,
  ctx: FrameContext,
  resolveCache: Map<string, Value>,
) {
  // Build an effective uniform map: explicit values overridden by param edges.
  const effective: Record<string, UniformValue> = {
    ...pass.uniformValues,
  };
  if (ctx.graph && pass.paramBindings.length) {
    for (const b of pass.paramBindings) {
      effective[b.uniformName] = resolveValueFor(
        b.sourceNodeId,
        ctx.graph,
        { time: ctx.time },
        resolveCache,
      );
    }
  }

  let cache = userUniformCache.get(pass);
  if (!cache) {
    cache = new Map();
    userUniformCache.set(pass, cache);
  }

  for (const [name, value] of Object.entries(effective)) {
    const loc = pass.program.uniforms[name];
    if (loc === undefined || loc === null) continue;
    if (uniformValuesEqual(cache.get(name), value)) continue;
    uploadUniform(gl, loc, value);
    cache.set(name, snapshotUniformValue(value));
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
      if (img) {
        texture = img.texture;
      } else {
        // External live sources (webcam etc.) live outside the plan because
        // they survive across recompiles. Their texture may also be null on
        // any given frame while acquisition is pending — skip in that case.
        texture = getExternalTexture(s.sourceNodeId);
      }
    }
    if (!texture) continue;
    const loc = pass.program.uniforms[s.uniformName];
    if (loc === undefined) continue;
    setUniform(gl, loc ?? null, {
      kind: "sampler2D",
      texture,
      unit: s.unit,
    });
  }
}

/**
 * Compute sub-viewport rectangles for N outputs. Layouts:
 *   1 → full canvas
 *   2 → left/right halves
 *   3 → top row of 2, bottom centered
 *   4 → 2×2 grid
 */
export function splitLayout(
  n: number,
  W: number,
  H: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  if (n === 2) {
    const w = Math.floor(W / 2);
    return [
      { x: 0, y: 0, w, h: H },
      { x: w, y: 0, w: W - w, h: H },
    ];
  }
  if (n === 3) {
    const h = Math.floor(H / 2);
    const w = Math.floor(W / 2);
    return [
      { x: 0, y: h, w, h: H - h }, // top-left
      { x: w, y: h, w: W - w, h: H - h }, // top-right
      { x: 0, y: 0, w: W, h }, // bottom full
    ];
  }
  // n >= 4 — 2×2 grid; extras are clipped to the last cell.
  const w = Math.floor(W / 2);
  const h = Math.floor(H / 2);
  return [
    { x: 0, y: h, w, h: H - h },
    { x: w, y: h, w: W - w, h: H - h },
    { x: 0, y: 0, w, h },
    { x: w, y: 0, w: W - w, h },
  ].slice(0, Math.min(n, 4));
}

export function executePlan(
  gl: WebGL2RenderingContext,
  plan: ExecutionPlan,
  ctx: FrameContext,
  canvasWidth: number,
  canvasHeight: number,
) {
  const passByNode = new Map<string, Pass>();
  for (const p of plan.passes) passByNode.set(p.nodeId, p);
  const shaderPassByNode = new Map<string, ShaderPass>();
  for (const p of plan.passes) {
    if (p.kind === "shader") shaderPassByNode.set(p.nodeId, p);
  }

  // One resolver cache per frame so fan-out utility nodes are evaluated once.
  const resolveCache = new Map<string, Value>();

  // Run each pass in topological order. ComputePass dispatches TF and swaps
  // its read side; ShaderPass with a compute mesh input picks the VAO matching
  // the upstream compute pass's (post-swap) read side, so it draws the data
  // captured this frame.
  gl.viewport(0, 0, plan.width, plan.height);
  for (const pass of plan.passes) {
    if (pass.kind === "compute") {
      executeComputePass(gl, pass, ctx, resolveCache);
      continue;
    }
    bindFramebuffer(gl, pass.fbo);
    gl.viewport(0, 0, plan.width, plan.height);
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
    bindUserUniforms(gl, pass, ctx, resolveCache);
    bindSamplers(gl, pass, shaderPassByNode, plan);
    if (pass.meshComputeNodeId && pass.meshComputeVaos) {
      const cp = passByNode.get(pass.meshComputeNodeId);
      if (cp && cp.kind === "compute") {
        pass.mesh.vao =
          cp.read === "A" ? pass.meshComputeVaos[0] : pass.meshComputeVaos[1];
      }
    }
    drawMesh(gl, pass.mesh);
  }

  // Composite to canvas
  bindFramebuffer(gl, null);
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  const bg = ctx.background ?? [0.07, 0.07, 0.09];
  // Background clear shows through any fragment that the composite shader
  // discards (only fragments outside every cell — i.e. integer-rounding gaps).
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const drawable = plan.outputs.filter(
    (o) => o.sourceNodeId && shaderPassByNode.has(o.sourceNodeId),
  );
  if (drawable.length === 0) {
    drawPlaceholder(gl, bg);
    return;
  }
  const cells = splitLayout(drawable.length, canvasWidth, canvasHeight);
  const textures: WebGLTexture[] = [];
  for (let i = 0; i < drawable.length; i++) {
    const src = shaderPassByNode.get(drawable[i]!.sourceNodeId!)!;
    textures.push(src.fbo.color.texture);
  }
  compositeOutputs(gl, textures, cells, canvasWidth, canvasHeight);
}

/**
 * Run one Transform Feedback dispatch for a ComputePass. Inputs come from the
 * `read` side's VAO; capture targets are the `!read` side's TF object.
 * After endTransformFeedback the swap flips `read` so the newly captured side
 * becomes the next-frame input (and so a downstream ShaderPass reads it).
 */
function executeComputePass(
  gl: WebGL2RenderingContext,
  pass: ComputePass,
  ctx: FrameContext,
  resolveCache: Map<string, Value>,
) {
  gl.useProgram(pass.program.program);
  bindComputeSystemUniforms(gl, pass, ctx);
  bindUserUniforms(gl, pass, ctx, resolveCache);

  const readingA = pass.read === "A";
  gl.bindVertexArray(readingA ? pass.vaoA : pass.vaoB);
  gl.bindTransformFeedback(
    gl.TRANSFORM_FEEDBACK,
    readingA ? pass.tfB : pass.tfA,
  );
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(pass.primitive);
  gl.drawArrays(pass.primitive, 0, pass.count);
  gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  gl.bindVertexArray(null);

  // Swap: the side we just captured into is now the freshest data.
  pass.read = readingA ? "B" : "A";
}

const MAX_COMPOSITE_OUTPUTS = 4;

interface CompositeState {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  countLoc: WebGLUniformLocation | null;
  cellLocs: Array<WebGLUniformLocation | null>;
}

let _composite: CompositeState | null = null;

function ensureComposite(gl: WebGL2RenderingContext): CompositeState {
  if (_composite) return _composite;
  const vs = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
  // Pixel-space cell rects (x, y, w, h) — matches splitLayout output directly,
  // so boundaries are integer-exact and tile losslessly via gl_FragCoord.
  const fs = `#version 300 es
precision highp float;
uniform int u_count;
uniform vec4 u_cells[${MAX_COMPOSITE_OUTPUTS}];
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;
uniform sampler2D u_tex3;
out vec4 outColor;

vec4 sampleSlot(int i, vec2 uv) {
  if (i == 0) return texture(u_tex0, uv);
  if (i == 1) return texture(u_tex1, uv);
  if (i == 2) return texture(u_tex2, uv);
  return texture(u_tex3, uv);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  for (int i = 0; i < ${MAX_COMPOSITE_OUTPUTS}; i++) {
    if (i >= u_count) break;
    vec4 c = u_cells[i];
    if (frag.x >= c.x && frag.x < c.x + c.z &&
        frag.y >= c.y && frag.y < c.y + c.w) {
      vec2 local = (frag - c.xy) / c.zw;
      outColor = sampleSlot(i, local);
      return;
    }
  }
  discard;
}`;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);

  // Sampler unit assignments are constant — set once now.
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "u_tex0"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_tex1"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_tex2"), 2);
  gl.uniform1i(gl.getUniformLocation(program, "u_tex3"), 3);

  const countLoc = gl.getUniformLocation(program, "u_count");
  const cellLocs: Array<WebGLUniformLocation | null> = [];
  for (let i = 0; i < MAX_COMPOSITE_OUTPUTS; i++) {
    cellLocs.push(gl.getUniformLocation(program, `u_cells[${i}]`));
  }

  const attrLoc = gl.getAttribLocation(program, "a_position");
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(attrLoc);
  gl.vertexAttribPointer(attrLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  _composite = { program, vao, countLoc, cellLocs };
  return _composite;
}

/**
 * Composite N (1..4) source textures onto the default framebuffer in a single
 * draw call. The fragment shader uses `gl_FragCoord` against pixel-exact cell
 * rects (matching `splitLayout`) to pick which texture to sample. Replaces the
 * previous N-times `useProgram + bindVAO + drawArrays` loop with one dispatch
 * and one set of state binds.
 */
function compositeOutputs(
  gl: WebGL2RenderingContext,
  textures: WebGLTexture[],
  cells: Array<{ x: number; y: number; w: number; h: number }>,
  canvasWidth: number,
  canvasHeight: number,
) {
  const state = ensureComposite(gl);
  const n = Math.min(textures.length, MAX_COMPOSITE_OUTPUTS);

  gl.disable(gl.DEPTH_TEST);
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  gl.useProgram(state.program);
  gl.bindVertexArray(state.vao);

  for (let i = 0; i < n; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, textures[i]!);
    const cell = cells[i]!;
    gl.uniform4f(
      state.cellLocs[i] ?? null,
      cell.x,
      cell.y,
      Math.max(1, cell.w),
      Math.max(1, cell.h),
    );
  }
  gl.uniform1i(state.countLoc ?? null, n);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}

function drawPlaceholder(
  gl: WebGL2RenderingContext,
  bg: [number, number, number],
) {
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
