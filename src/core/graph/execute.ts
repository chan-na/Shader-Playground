// biome-ignore-all lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL API, not a React hook
// biome-ignore-all lint/style/noNonNullAssertion: WebGL setup; null only on context loss, treated as fatal upstream
import { mat4 } from "gl-matrix";
import {
  cameraEye,
  modelMatrix,
  type OrbitCameraState,
  projMatrix,
  viewMatrix,
} from "../camera/orbitCamera";
import { getExternalTexture } from "../external/registry";
import { bindFramebuffer } from "../gl/framebuffer";
import type { GpuTimerPool } from "../gl/gpuTimer";
import { drawMesh } from "../gl/mesh";
import type { CompiledProgram } from "../gl/program";
import { setUniform } from "../gl/uniforms";
import { resolveValueFor, type Value } from "../nodes/utility";
import type { ComputePass, ExecutionPlan, ShaderPass } from "./compile";
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
  /**
   * Pointer state for `u_mouse` (vec4): xy = current position, zw = last
   * click position. Framebuffer pixels, bottom-left origin (matches
   * gl_FragCoord / u_resolution). Defaults to all-zero when omitted.
   */
  mouse?: [number, number, number, number];
  /** Accumulated render-frame counter for `u_frame`. Defaults to 0. */
  frame?: number;
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
/**
 * Scratch tuple for the pass-space `u_mouse` value. Module scope because
 * `bindSystemUniforms` runs once per pass per frame on the RAF hot path — a
 * fresh literal there would allocate for every pass of every frame.
 */
const _mouse: [number, number, number, number] = [0, 0, 0, 0];

/**
 * GLSL integer uniform types (GL_INT, GL_INT_VEC2..4). Deliberately an
 * allow-list and *not* "anything that isn't GL_FLOAT": SAMPLER_2D (0x8B5E) is
 * also non-float but is uploaded by `bindSamplers` as a texture unit, and BOOL
 * (0x8B56) legally accepts a float upload in GLES3 — routing either through the
 * integer entry points would break working shaders. (#11)
 */
const INT_UNIFORM_TYPES = new Set([0x1404, 0x8b53, 0x8b54, 0x8b55]);

/** Numeric shapes accepted by the type-aware uniform path. */
type NumericUniform = number | number[] | Float32Array;

function roundAt(v: number[] | Float32Array, i: number): number {
  return Math.round(v[i] ?? 0);
}

/**
 * The one type-aware uniform upload path — system uniforms, compute system
 * uniforms and user uniforms all land here. Resolves the location *and* the
 * program's reflected GLSL type by name, so a shader that declares
 * `uniform int u_frame;` (or an `ivec2` user uniform) gets `uniform*i` instead
 * of a silent INVALID_OPERATION from `uniform*f`. (#11)
 */
function setTypedUniform(
  gl: WebGL2RenderingContext,
  program: CompiledProgram,
  name: string,
  value: NumericUniform,
) {
  const loc = program.uniforms[name];
  if (loc === undefined || loc === null) return;
  const type = program.uniformTypes[name];
  if (type === undefined || !INT_UNIFORM_TYPES.has(type)) {
    setUniform(gl, loc, value);
    return;
  }
  // Values arrive as JS numbers (the UI stores every uniform as a float), so
  // round rather than truncate — a slider resting on 2.9999 means 3.
  if (typeof value === "number") {
    gl.uniform1i(loc, Math.round(value));
    return;
  }
  switch (value.length) {
    case 1:
      gl.uniform1i(loc, roundAt(value, 0));
      return;
    case 2:
      gl.uniform2i(loc, roundAt(value, 0), roundAt(value, 1));
      return;
    case 3:
      gl.uniform3i(
        loc,
        roundAt(value, 0),
        roundAt(value, 1),
        roundAt(value, 2),
      );
      return;
    case 4:
      gl.uniform4i(
        loc,
        roundAt(value, 0),
        roundAt(value, 1),
        roundAt(value, 2),
        roundAt(value, 3),
      );
      return;
  }
}

function bindComputeSystemUniforms(
  gl: WebGL2RenderingContext,
  pass: ComputePass,
  ctx: FrameContext,
) {
  const p = pass.program;
  setTypedUniform(gl, p, "u_time", ctx.time);
  setTypedUniform(gl, p, "u_frame", ctx.frame ?? 0);
}

function bindSystemUniforms(
  gl: WebGL2RenderingContext,
  pass: ShaderPass,
  ctx: FrameContext,
) {
  const p = pass.program;
  setTypedUniform(gl, p, "u_time", ctx.time);
  setTypedUniform(gl, p, "u_resolution", [pass.width, pass.height]);
  // `ctx.mouse` is in canvas/plan framebuffer pixels, but `u_resolution` is the
  // *pass* size — a pass rendering at resolutionScale < 1 would otherwise see a
  // pointer far outside its own frame, so `u_mouse.xy / u_resolution` (the
  // Shadertoy idiom) blew past 1.0. Rescale per axis; x/z ride the width ratio,
  // y/w the height ratio. Scales are 1 for full-resolution passes. (#19)
  const m: [number, number, number, number] = ctx.mouse ?? [0, 0, 0, 0];
  const mx = pass.width / Math.max(1, ctx.width);
  const my = pass.height / Math.max(1, ctx.height);
  _mouse[0] = m[0] * mx;
  _mouse[1] = m[1] * my;
  _mouse[2] = m[2] * mx;
  _mouse[3] = m[3] * my;
  setTypedUniform(gl, p, "u_mouse", _mouse);
  setTypedUniform(gl, p, "u_frame", ctx.frame ?? 0);
  if (!pass.meshIsFullscreen) {
    viewMatrix(ctx.camera, _view);
    projMatrix(ctx.camera, pass.width / Math.max(1, pass.height), _proj);
    modelMatrix(_model);
    setTypedUniform(gl, p, "u_view", _view as Float32Array);
    setTypedUniform(gl, p, "u_proj", _proj as Float32Array);
    setTypedUniform(gl, p, "u_model", _model as Float32Array);
    setTypedUniform(gl, p, "u_camera", cameraEye(ctx.camera));
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
    setTypedUniform(gl, pass.program, name, value);
    cache.set(name, snapshotUniformValue(value));
  }
}

function bindSamplers(
  gl: WebGL2RenderingContext,
  pass: ShaderPass,
  passByNode: Map<string, ShaderPass>,
  plan: ExecutionPlan,
  ctx: FrameContext,
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
    if (!texture) {
      // No live texture. If the source is an internal render node
      // (shader/compute), it failed to compile this frame — bind an opaque
      // black placeholder so this unit doesn't sample whatever the previous
      // draw left bound (a stale-texture ghost). External sources mid-
      // acquisition (webcam/video/audio) and not-yet-loaded images are left
      // unbound instead: forcing black for the frame or two before their first
      // upload would be a more visible artifact than a brief stale frame. (L5)
      const srcNode = ctx.graph?.nodes.find((n) => n.id === s.sourceNodeId);
      if (
        srcNode &&
        (srcNode.kind === "shader" || srcNode.kind === "compute")
      ) {
        texture = ensureBlankTexture(gl);
      } else {
        continue;
      }
    }
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
  gpuTimer?: GpuTimerPool | null,
) {
  // Node lookups are cached on the plan at compile time (L23) — rebuilding them
  // every frame was pure allocation on the RAF hot path.
  const { passByNode, shaderPassByNode } = plan;

  // One resolver cache per frame so fan-out utility nodes are evaluated once.
  const resolveCache = new Map<string, Value>();

  // Run each pass in topological order. ComputePass dispatches TF and swaps
  // its read side; ShaderPass with a compute mesh input picks the VAO matching
  // the upstream compute pass's (post-swap) read side, so it draws the data
  // captured this frame.
  gl.viewport(0, 0, plan.width, plan.height);
  for (const pass of plan.passes) {
    if (pass.kind === "compute") {
      gpuTimer?.begin(gl, pass.nodeId);
      executeComputePass(gl, pass, ctx, resolveCache);
      gpuTimer?.end(gl);
      continue;
    }
    bindFramebuffer(gl, pass.fbo);
    gl.viewport(0, 0, pass.width, pass.height);
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
    bindSamplers(gl, pass, shaderPassByNode, plan, ctx);
    if (pass.meshComputeNodeId && pass.meshComputeVaos) {
      const cp = passByNode.get(pass.meshComputeNodeId);
      if (cp && cp.kind === "compute") {
        pass.mesh.vao =
          cp.read === "A" ? pass.meshComputeVaos[0] : pass.meshComputeVaos[1];
      }
    }
    gpuTimer?.begin(gl, pass.nodeId);
    drawMesh(gl, pass.mesh);
    gpuTimer?.end(gl);
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
  vbo: WebGLBuffer;
  countLoc: WebGLUniformLocation | null;
  cellLocs: Array<WebGLUniformLocation | null>;
}

let _composite: CompositeState | null = null;

// A 1×1 opaque-black texture bound in place of a sampler source whose
// shader/compute pass failed to compile (L5). Module-cached like the composite
// pipeline and invalidated on context loss via resetComposite.
let _blankTexture: WebGLTexture | null = null;

/**
 * Drop this module's cached GL objects (composite pipeline + blank placeholder
 * texture) so they are rebuilt against the current GL context. Must be called on
 * WebGL context loss/restore: WebGL reuses the same `gl` object across a loss,
 * so keying the cache on it would keep handing back dead handles. An explicit
 * reset is the only correct invalidation. `gl` may be null (or a lost context) —
 * the deletes are then harmless no-ops and we still clear the JS references.
 */
export function resetComposite(gl: WebGL2RenderingContext | null): void {
  if (_composite) {
    if (gl) {
      gl.deleteProgram(_composite.program);
      gl.deleteVertexArray(_composite.vao);
      gl.deleteBuffer(_composite.vbo);
    }
    _composite = null;
  }
  if (_blankTexture) {
    if (gl) gl.deleteTexture(_blankTexture);
    _blankTexture = null;
  }
}

/**
 * Lazily build (and cache) a 1×1 opaque-black texture. Bound to a sampler unit
 * whose source render node failed to compile so the unit shows black instead of
 * ghosting whatever texture the previous draw left bound there. (L5)
 */
function ensureBlankTexture(gl: WebGL2RenderingContext): WebGLTexture {
  if (_blankTexture) return _blankTexture;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  _blankTexture = tex;
  return _blankTexture;
}

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

  _composite = { program, vao, vbo, countLoc, cellLocs };
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
