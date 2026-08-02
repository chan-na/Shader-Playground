// Test-only fake WebGL2RenderingContext.
// Returns truthy resource handles and lets queries (link/compile status,
// uniform/attribute enumeration) be configured per-test. Every other gl method
// is a no-op. Lets unit tests exercise GL-touching modules without a real GPU;
// the production pipeline is covered end-to-end by Playwright + SwiftShader.
//
// Implemented as a plain object (not a Proxy) so vi.spyOn can intercept
// methods like uniform1f / bindTexture for call-site assertions.

interface FakeGlOptions {
  /** Names returned by getActiveAttrib (and resolved by getAttribLocation). */
  attributes?: string[];
  /** Names returned by getActiveUniform. */
  uniforms?: string[];
  /**
   * GLSL type enum reported by getActiveUniform, keyed by the same name as it
   * appears in `uniforms`. Purely additive — names not listed here keep
   * reporting FLOAT, so existing `uniforms`-only callers are unaffected. (#11)
   */
  uniformTypes?: Record<string, number>;
  /** Force linkProgram to report failure. */
  linkFailure?: boolean;
  /** Force compileShader to report failure. */
  compileFailure?: boolean;
  /** Force every create* call to return null (allocation-failure paths). */
  resourceFailure?: boolean;
  /** Override checkFramebufferStatus return value. */
  framebufferStatus?: number;
  /** First getError() return value (one-shot; subsequent calls return 0). */
  glError?: number;
}

const CONSTANTS = {
  VERTEX_SHADER: 35633,
  FRAGMENT_SHADER: 35632,
  COMPILE_STATUS: 35713,
  LINK_STATUS: 35714,
  ACTIVE_ATTRIBUTES: 35721,
  ACTIVE_UNIFORMS: 35718,
  ARRAY_BUFFER: 34962,
  ELEMENT_ARRAY_BUFFER: 34963,
  STATIC_DRAW: 35044,
  DYNAMIC_DRAW: 35048,
  DYNAMIC_COPY: 35050,
  POINTS: 0,
  LINES: 1,
  TRIANGLES: 4,
  FLOAT: 5126,
  // Uniform type enums — the int family drives the integer upload path, BOOL
  // and SAMPLER_2D exist so tests can pin that they are *not* treated as int.
  INT: 0x1404,
  INT_VEC2: 0x8b53,
  INT_VEC3: 0x8b54,
  INT_VEC4: 0x8b55,
  BOOL: 0x8b56,
  FLOAT_VEC2: 0x8b50,
  FLOAT_VEC4: 0x8b52,
  SAMPLER_2D: 0x8b5e,
  UNSIGNED_BYTE: 5121,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  TEXTURE_2D: 3553,
  TEXTURE0: 33984,
  RGBA: 6408,
  RGBA8: 32856,
  TEXTURE_MIN_FILTER: 10241,
  TEXTURE_MAG_FILTER: 10240,
  TEXTURE_WRAP_S: 10242,
  TEXTURE_WRAP_T: 10243,
  LINEAR: 9729,
  NEAREST: 9728,
  LINEAR_MIPMAP_LINEAR: 9987,
  CLAMP_TO_EDGE: 33071,
  REPEAT: 10497,
  UNPACK_FLIP_Y_WEBGL: 37440,
  FRAMEBUFFER: 36160,
  COLOR_ATTACHMENT0: 36064,
  DEPTH_ATTACHMENT: 36096,
  FRAMEBUFFER_COMPLETE: 36053,
  RENDERBUFFER: 36161,
  DEPTH_COMPONENT24: 33190,
  TRANSFORM_FEEDBACK: 36386,
  TRANSFORM_FEEDBACK_BUFFER: 35982,
  SEPARATE_ATTRIBS: 35981,
  RASTERIZER_DISCARD: 35977,
  // Render-state enums (E-2): previously absent, so `gl.enable`/`gl.disable`
  // calls using them received `undefined` — harmless against the `noop`
  // implementations here, but it meant `vi.spyOn(gl, "enable")` assertions
  // couldn't distinguish "which state" was toggled.
  DEPTH_TEST: 2929,
  CULL_FACE: 2884,
  BLEND: 3042,
} as const;

let _counter = 0;
const noop = () => undefined;

export function createFakeGl(opts: FakeGlOptions = {}): WebGL2RenderingContext {
  const handle = (): unknown =>
    opts.resourceFailure ? null : { __id: ++_counter };

  // getError clears one flag per call — model that with a one-shot queue so the
  // drain loop in checkGlError terminates instead of spinning on a sticky code.
  const errorQueue: number[] = opts.glError !== undefined ? [opts.glError] : [];

  const gl = {
    ...CONSTANTS,
    getError: () => errorQueue.shift() ?? 0,

    // Shader / program lifecycle
    createShader: handle,
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: (_s: unknown, _p: number) => !opts.compileFailure,
    getShaderInfoLog: () => "fake compile log",
    deleteShader: noop,
    createProgram: handle,
    attachShader: noop,
    linkProgram: noop,
    deleteProgram: noop,
    transformFeedbackVaryings: noop,
    useProgram: noop,
    getProgramParameter: (_p: unknown, name: number) => {
      if (name === CONSTANTS.LINK_STATUS) return !opts.linkFailure;
      if (name === CONSTANTS.ACTIVE_ATTRIBUTES)
        return (opts.attributes ?? []).length;
      if (name === CONSTANTS.ACTIVE_UNIFORMS)
        return (opts.uniforms ?? []).length;
      return 0;
    },
    getProgramInfoLog: () => "fake link log",
    getActiveAttrib: (_p: unknown, i: number) => {
      const n = opts.attributes?.[i];
      return n ? { name: n, size: 1, type: CONSTANTS.FLOAT } : null;
    },
    getActiveUniform: (_p: unknown, i: number) => {
      const n = opts.uniforms?.[i];
      return n
        ? { name: n, size: 1, type: opts.uniformTypes?.[n] ?? CONSTANTS.FLOAT }
        : null;
    },
    getAttribLocation: (_p: unknown, name: string) =>
      opts.attributes?.indexOf(name) ?? -1,
    getUniformLocation: () => ({ __loc: ++_counter }),

    // Buffer + VAO + TF
    createBuffer: handle,
    bindBuffer: noop,
    bufferData: noop,
    deleteBuffer: noop,
    createVertexArray: handle,
    bindVertexArray: noop,
    enableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    deleteVertexArray: noop,
    createTransformFeedback: handle,
    bindTransformFeedback: noop,
    bindBufferBase: noop,
    beginTransformFeedback: noop,
    endTransformFeedback: noop,
    deleteTransformFeedback: noop,

    // Texture
    createTexture: handle,
    bindTexture: noop,
    texImage2D: noop,
    texParameteri: noop,
    pixelStorei: noop,
    generateMipmap: noop,
    deleteTexture: noop,
    activeTexture: noop,

    // Framebuffer + renderbuffer
    createFramebuffer: handle,
    bindFramebuffer: noop,
    framebufferTexture2D: noop,
    createRenderbuffer: handle,
    bindRenderbuffer: noop,
    renderbufferStorage: noop,
    framebufferRenderbuffer: noop,
    deleteFramebuffer: noop,
    deleteRenderbuffer: noop,
    checkFramebufferStatus: () =>
      opts.framebufferStatus ?? CONSTANTS.FRAMEBUFFER_COMPLETE,

    // Draw / state
    viewport: noop,
    clear: noop,
    clearColor: noop,
    enable: noop,
    disable: noop,
    drawArrays: noop,
    drawElements: noop,
    drawArraysInstanced: noop,
    depthMask: noop,
    blendFunc: noop,
    blendFuncSeparate: noop,

    // Uniforms
    uniform1f: noop,
    uniform2f: noop,
    uniform3f: noop,
    uniform4f: noop,
    uniform1i: noop,
    uniform2i: noop,
    uniform3i: noop,
    uniform4i: noop,
    uniform1fv: noop,
    uniform2fv: noop,
    uniform3fv: noop,
    uniform4fv: noop,
    uniformMatrix3fv: noop,
    uniformMatrix4fv: noop,
  };

  return gl as unknown as WebGL2RenderingContext;
}
