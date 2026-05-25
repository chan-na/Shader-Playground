/**
 * Hand-rolled builtin GLSL function catalogue for editor hover / autocomplete
 * detail (Phase 25). One entry per name with a small set of canonical
 * signatures plus a one-line description.
 *
 * Coverage tracks `GLSL_FUNCTIONS` in `ui/CodeEditor/autocomplete.ts` — a
 * unit test enforces that every public name there has a builtin entry, so
 * adding/removing one of them is caught by `npm run test`.
 *
 * The signatures use `genType` / `genIType` / `genBType` to stand in for the
 * scalar+vector families per the GLSL spec; we don't expand them out
 * (12-overload `sin` etc. would just be noise in the tooltip).
 */

export interface BuiltinSpec {
  /** One or more canonical signatures rendered for hover. */
  signatures: string[];
  /** Human-readable single-sentence description. */
  description: string;
}

export const BUILTIN_FUNCTIONS: Record<string, BuiltinSpec> = {
  // Trigonometry ---------------------------------------------------------
  radians: {
    signatures: ["genType radians(genType degrees)"],
    description: "Converts degrees to radians.",
  },
  degrees: {
    signatures: ["genType degrees(genType radians)"],
    description: "Converts radians to degrees.",
  },
  sin: {
    signatures: ["genType sin(genType angle)"],
    description: "Returns the sine of the input (radians).",
  },
  cos: {
    signatures: ["genType cos(genType angle)"],
    description: "Returns the cosine of the input (radians).",
  },
  tan: {
    signatures: ["genType tan(genType angle)"],
    description: "Returns the tangent of the input (radians).",
  },
  asin: {
    signatures: ["genType asin(genType x)"],
    description: "Returns the arcsine of x, in [-π/2, π/2].",
  },
  acos: {
    signatures: ["genType acos(genType x)"],
    description: "Returns the arccosine of x, in [0, π].",
  },
  atan: {
    signatures: [
      "genType atan(genType y, genType x)",
      "genType atan(genType y_over_x)",
    ],
    description:
      "Returns the angle whose tangent is y/x (two-arg) or its argument (one-arg).",
  },
  sinh: {
    signatures: ["genType sinh(genType x)"],
    description: "Hyperbolic sine.",
  },
  cosh: {
    signatures: ["genType cosh(genType x)"],
    description: "Hyperbolic cosine.",
  },
  tanh: {
    signatures: ["genType tanh(genType x)"],
    description: "Hyperbolic tangent.",
  },
  asinh: {
    signatures: ["genType asinh(genType x)"],
    description: "Inverse hyperbolic sine.",
  },
  acosh: {
    signatures: ["genType acosh(genType x)"],
    description: "Inverse hyperbolic cosine (requires x ≥ 1).",
  },
  atanh: {
    signatures: ["genType atanh(genType x)"],
    description: "Inverse hyperbolic tangent (requires |x| < 1).",
  },

  // Exponential ----------------------------------------------------------
  pow: {
    signatures: ["genType pow(genType x, genType y)"],
    description: "Returns x raised to the power y.",
  },
  exp: {
    signatures: ["genType exp(genType x)"],
    description: "Returns eˣ.",
  },
  log: {
    signatures: ["genType log(genType x)"],
    description: "Returns the natural logarithm of x.",
  },
  exp2: {
    signatures: ["genType exp2(genType x)"],
    description: "Returns 2ˣ.",
  },
  log2: {
    signatures: ["genType log2(genType x)"],
    description: "Returns log₂(x).",
  },
  sqrt: {
    signatures: ["genType sqrt(genType x)"],
    description: "Returns the square root of x.",
  },
  inversesqrt: {
    signatures: ["genType inversesqrt(genType x)"],
    description: "Returns 1 / √x.",
  },

  // Common ---------------------------------------------------------------
  abs: {
    signatures: ["genType abs(genType x)", "genIType abs(genIType x)"],
    description: "Returns the absolute value of x.",
  },
  sign: {
    signatures: ["genType sign(genType x)", "genIType sign(genIType x)"],
    description: "Returns -1, 0, or 1 depending on the sign of x.",
  },
  floor: {
    signatures: ["genType floor(genType x)"],
    description: "Returns the largest integer ≤ x.",
  },
  ceil: {
    signatures: ["genType ceil(genType x)"],
    description: "Returns the smallest integer ≥ x.",
  },
  trunc: {
    signatures: ["genType trunc(genType x)"],
    description: "Truncates x toward zero.",
  },
  round: {
    signatures: ["genType round(genType x)"],
    description:
      "Rounds x to the nearest integer (ties may round either direction).",
  },
  roundEven: {
    signatures: ["genType roundEven(genType x)"],
    description: "Rounds x to the nearest even integer.",
  },
  fract: {
    signatures: ["genType fract(genType x)"],
    description: "Returns x - floor(x), the fractional part.",
  },
  mod: {
    signatures: [
      "genType mod(genType x, float y)",
      "genType mod(genType x, genType y)",
    ],
    description: "Returns x modulo y.",
  },
  modf: {
    signatures: ["genType modf(genType x, out genType i)"],
    description: "Splits x into integer (out param) and fractional parts.",
  },
  min: {
    signatures: [
      "genType min(genType x, genType y)",
      "genType min(genType x, float y)",
    ],
    description: "Returns the lesser of x and y.",
  },
  max: {
    signatures: [
      "genType max(genType x, genType y)",
      "genType max(genType x, float y)",
    ],
    description: "Returns the greater of x and y.",
  },
  clamp: {
    signatures: [
      "genType clamp(genType x, genType minVal, genType maxVal)",
      "genType clamp(genType x, float minVal, float maxVal)",
    ],
    description: "Returns min(max(x, minVal), maxVal).",
  },
  mix: {
    signatures: [
      "genType mix(genType x, genType y, genType a)",
      "genType mix(genType x, genType y, float a)",
    ],
    description: "Linear interpolation: x*(1-a) + y*a.",
  },
  step: {
    signatures: [
      "genType step(genType edge, genType x)",
      "genType step(float edge, genType x)",
    ],
    description: "Returns 0.0 if x < edge, otherwise 1.0.",
  },
  smoothstep: {
    signatures: [
      "genType smoothstep(genType edge0, genType edge1, genType x)",
      "genType smoothstep(float edge0, float edge1, genType x)",
    ],
    description: "Hermite interpolation between 0 and 1 across [edge0, edge1].",
  },
  isnan: {
    signatures: ["genBType isnan(genType x)"],
    description: "Per-component NaN test.",
  },
  isinf: {
    signatures: ["genBType isinf(genType x)"],
    description: "Per-component infinity test.",
  },

  // Geometric ------------------------------------------------------------
  length: {
    signatures: ["float length(genType x)"],
    description: "Returns the Euclidean length of x.",
  },
  distance: {
    signatures: ["float distance(genType p0, genType p1)"],
    description: "Returns the distance between p0 and p1.",
  },
  dot: {
    signatures: ["float dot(genType x, genType y)"],
    description: "Returns the dot product of x and y.",
  },
  cross: {
    signatures: ["vec3 cross(vec3 x, vec3 y)"],
    description: "Returns the cross product of two 3-vectors.",
  },
  normalize: {
    signatures: ["genType normalize(genType x)"],
    description: "Returns x scaled to unit length.",
  },
  faceforward: {
    signatures: ["genType faceforward(genType N, genType I, genType Nref)"],
    description: "Returns N facing in the direction opposite to I·Nref.",
  },
  reflect: {
    signatures: ["genType reflect(genType I, genType N)"],
    description: "Reflection direction I − 2*dot(N, I)*N.",
  },
  refract: {
    signatures: ["genType refract(genType I, genType N, float eta)"],
    description: "Snell's law refraction direction.",
  },

  // Matrix ---------------------------------------------------------------
  matrixCompMult: {
    signatures: ["mat matrixCompMult(mat x, mat y)"],
    description: "Component-wise multiplication of two matrices.",
  },
  outerProduct: {
    signatures: ["mat outerProduct(vec c, vec r)"],
    description: "Outer product of a column vector and a row vector.",
  },
  transpose: {
    signatures: ["mat transpose(mat m)"],
    description: "Returns the transpose of m.",
  },
  inverse: {
    signatures: ["mat inverse(mat m)"],
    description: "Returns the inverse of m.",
  },
  determinant: {
    signatures: ["float determinant(mat m)"],
    description: "Returns the determinant of m.",
  },

  // Vector relational ----------------------------------------------------
  lessThan: {
    signatures: ["bvec lessThan(vec x, vec y)"],
    description: "Component-wise x < y.",
  },
  lessThanEqual: {
    signatures: ["bvec lessThanEqual(vec x, vec y)"],
    description: "Component-wise x ≤ y.",
  },
  greaterThan: {
    signatures: ["bvec greaterThan(vec x, vec y)"],
    description: "Component-wise x > y.",
  },
  greaterThanEqual: {
    signatures: ["bvec greaterThanEqual(vec x, vec y)"],
    description: "Component-wise x ≥ y.",
  },
  equal: {
    signatures: ["bvec equal(vec x, vec y)"],
    description: "Component-wise x == y.",
  },
  notEqual: {
    signatures: ["bvec notEqual(vec x, vec y)"],
    description: "Component-wise x != y.",
  },
  any: {
    signatures: ["bool any(bvec x)"],
    description: "True if any component of x is true.",
  },
  all: {
    signatures: ["bool all(bvec x)"],
    description: "True if all components of x are true.",
  },
  not: {
    signatures: ["bvec not(bvec x)"],
    description: "Component-wise logical NOT.",
  },

  // Texture lookup -------------------------------------------------------
  texture: {
    signatures: [
      "vec4 texture(sampler2D sampler, vec2 P)",
      "vec4 texture(samplerCube sampler, vec3 P)",
    ],
    description: "Samples the texture at coordinate P.",
  },
  texture2D: {
    signatures: ["vec4 texture2D(sampler2D sampler, vec2 P)"],
    description: "Legacy GLSL ES 1.0 alias of texture().",
  },
  textureCube: {
    signatures: ["vec4 textureCube(samplerCube sampler, vec3 P)"],
    description: "Legacy GLSL ES 1.0 alias for cubemap texture().",
  },
  textureLod: {
    signatures: ["vec4 textureLod(sampler2D sampler, vec2 P, float lod)"],
    description: "Samples the texture at the explicit mipmap level lod.",
  },
  textureGrad: {
    signatures: [
      "vec4 textureGrad(sampler2D sampler, vec2 P, vec2 dPdx, vec2 dPdy)",
    ],
    description: "Samples with explicit gradients (for anisotropic filtering).",
  },
  texelFetch: {
    signatures: ["vec4 texelFetch(sampler2D sampler, ivec2 P, int lod)"],
    description: "Reads a single texel at integer coordinate P (no filtering).",
  },
  textureSize: {
    signatures: ["ivec2 textureSize(sampler2D sampler, int lod)"],
    description: "Returns the pixel dimensions of the texture at lod.",
  },
  textureProj: {
    signatures: ["vec4 textureProj(sampler2D sampler, vec3 P)"],
    description: "Samples with projective divide: texture(s, P.xy / P.z).",
  },

  // Derivatives ----------------------------------------------------------
  dFdx: {
    signatures: ["genType dFdx(genType p)"],
    description: "Partial derivative of p with respect to screen x.",
  },
  dFdy: {
    signatures: ["genType dFdy(genType p)"],
    description: "Partial derivative of p with respect to screen y.",
  },
  fwidth: {
    signatures: ["genType fwidth(genType p)"],
    description: "Sum of absolute derivatives: abs(dFdx(p)) + abs(dFdy(p)).",
  },
};

/**
 * Short descriptions for GLSL keywords. Used by hover to give a one-liner
 * when the user lands on a reserved word; keys here are a subset of
 * `GLSL_KEYWORDS` (autocomplete.ts) — those that have a meaningful blurb.
 * Storage qualifiers we leave to the symbol table.
 */
export const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  uniform: "Storage qualifier — value set by the host (CPU side).",
  attribute: "GLSL ES 1.0 storage qualifier — per-vertex input.",
  varying: "GLSL ES 1.0 storage qualifier — vertex-to-fragment interpolant.",
  in: "Storage qualifier — input to the current shader stage.",
  out: "Storage qualifier — output of the current shader stage.",
  inout: "Function parameter qualifier — read/write.",
  const: "Compile-time constant.",
  centroid: "Per-fragment interpolation qualifier — centroid sampling.",
  flat: "Per-fragment interpolation qualifier — no interpolation.",
  smooth: "Per-fragment interpolation qualifier — perspective-correct.",
  noperspective:
    "Per-fragment interpolation qualifier — linear in screen space.",
  return: "Return from the current function.",
  if: "Conditional branch.",
  else: "Alternative branch of an `if`.",
  for: "Counted loop.",
  while: "Pre-test loop.",
  do: "Post-test loop.",
  break: "Exit the innermost loop or switch.",
  continue: "Skip to the next iteration of the innermost loop.",
  discard: "Discard the current fragment without writing to the framebuffer.",
  switch: "Multi-way branch on an integer value.",
  case: "A target of a `switch`.",
  default: "Fallback target of a `switch`.",
  struct: "Aggregate user-defined type.",
  layout: "Resource layout qualifier (e.g. binding, location).",
  precision: "Default precision qualifier for the file.",
  highp: "High precision qualifier.",
  mediump: "Medium precision qualifier.",
  lowp: "Low precision qualifier.",
  true: "Boolean literal true.",
  false: "Boolean literal false.",
};
