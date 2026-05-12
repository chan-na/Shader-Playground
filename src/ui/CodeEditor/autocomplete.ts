import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { parseUniforms } from "../../core/graph/uniformParser";

export const GLSL_FUNCTIONS = [
  // Trigonometry
  "radians",
  "degrees",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
  // Exponential
  "pow",
  "exp",
  "log",
  "exp2",
  "log2",
  "sqrt",
  "inversesqrt",
  // Common
  "abs",
  "sign",
  "floor",
  "ceil",
  "trunc",
  "round",
  "roundEven",
  "fract",
  "mod",
  "modf",
  "min",
  "max",
  "clamp",
  "mix",
  "step",
  "smoothstep",
  "isnan",
  "isinf",
  // Geometric
  "length",
  "distance",
  "dot",
  "cross",
  "normalize",
  "faceforward",
  "reflect",
  "refract",
  // Matrix
  "matrixCompMult",
  "outerProduct",
  "transpose",
  "inverse",
  "determinant",
  // Vector relational
  "lessThan",
  "lessThanEqual",
  "greaterThan",
  "greaterThanEqual",
  "equal",
  "notEqual",
  "any",
  "all",
  "not",
  // Texture lookup
  "texture",
  "texture2D",
  "textureCube",
  "textureLod",
  "textureGrad",
  "texelFetch",
  "textureSize",
  "textureProj",
  // Derivatives
  "dFdx",
  "dFdy",
  "fwidth",
];

export const GLSL_TYPES = [
  "void",
  "bool",
  "int",
  "uint",
  "float",
  "vec2",
  "vec3",
  "vec4",
  "ivec2",
  "ivec3",
  "ivec4",
  "uvec2",
  "uvec3",
  "uvec4",
  "bvec2",
  "bvec3",
  "bvec4",
  "mat2",
  "mat3",
  "mat4",
  "mat2x2",
  "mat2x3",
  "mat2x4",
  "mat3x2",
  "mat3x3",
  "mat3x4",
  "mat4x2",
  "mat4x3",
  "mat4x4",
  "sampler2D",
  "samplerCube",
  "sampler3D",
  "sampler2DArray",
  "isampler2D",
  "usampler2D",
];

export const GLSL_KEYWORDS = [
  "uniform",
  "attribute",
  "varying",
  "in",
  "out",
  "inout",
  "const",
  "centroid",
  "flat",
  "smooth",
  "noperspective",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "break",
  "continue",
  "discard",
  "switch",
  "case",
  "default",
  "struct",
  "layout",
  "precision",
  "highp",
  "mediump",
  "lowp",
  "true",
  "false",
];

export const HINT_KEYWORDS: ReadonlyArray<{ label: string; info: string }> = [
  { label: "@range", info: "Numeric range (e.g. @range 0..1)" },
  { label: "@min", info: "Lower bound (e.g. @min 0)" },
  { label: "@max", info: "Upper bound (e.g. @max 1)" },
  { label: "@step", info: "Slider step (e.g. @step 0.01)" },
  {
    label: "@default",
    info: "Default value (scalar or comma-separated vector)",
  },
  { label: "@label", info: 'Custom label (e.g. @label "Brightness")' },
  { label: "@color", info: "Force color-picker control" },
  { label: "@slider", info: "Force slider control" },
  { label: "@multi", info: "Force multi-axis slider control" },
];

const STATIC_FUNCTIONS: Completion[] = GLSL_FUNCTIONS.map((name) => ({
  label: name,
  type: "function",
}));

const STATIC_TYPES: Completion[] = GLSL_TYPES.map((name) => ({
  label: name,
  type: "type",
}));

const STATIC_KEYWORDS: Completion[] = GLSL_KEYWORDS.map((name) => ({
  label: name,
  type: "keyword",
}));

const STATIC_BASE: Completion[] = [
  ...STATIC_FUNCTIONS,
  ...STATIC_TYPES,
  ...STATIC_KEYWORDS,
];

const HINT_COMPLETIONS: Completion[] = HINT_KEYWORDS.map(({ label, info }) => ({
  label,
  type: "keyword",
  info,
}));

/** Convert parsed uniforms into autocomplete options. Visible for testing. */
export function uniformCompletions(source: string): Completion[] {
  return parseUniforms(source).map((u) => {
    const opt: Completion = { label: u.name, type: "variable", detail: u.type };
    if (u.label) opt.info = u.label;
    return opt;
  });
}

function lineTextBefore(context: CompletionContext): string {
  const line = context.state.doc.lineAt(context.pos);
  return line.text.slice(0, context.pos - line.from);
}

/**
 * Completions for `@xxx` tokens inside a `//` line comment.
 * Fires only when a `@`-prefixed word precedes the cursor AND a `//` appears
 * earlier on the same line.
 */
export function hintSource(
  context: CompletionContext,
): CompletionResult | null {
  const before = context.matchBefore(/@\w*/);
  if (!before) return null;
  const upto = lineTextBefore(context);
  const slashIdx = upto.indexOf("//");
  if (slashIdx < 0) return null;
  // The `@` must come after the `//` start. before.from is the absolute doc
  // offset of `@`; convert to a column offset to compare against slashIdx.
  const line = context.state.doc.lineAt(context.pos);
  const atCol = before.from - line.from;
  if (atCol < slashIdx) return null;
  return {
    from: before.from,
    options: HINT_COMPLETIONS,
    validFor: /^@\w*$/,
  };
}

/**
 * GLSL identifier completions: builtin types, builtin functions, keywords, and
 * uniforms parsed from the current document. Suppressed inside line comments
 * (hintSource handles the `@` vocabulary separately).
 */
export function glslSource(
  context: CompletionContext,
): CompletionResult | null {
  if (lineTextBefore(context).includes("//")) return null;
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  // Auto-trigger only when a partial identifier precedes the cursor; Ctrl+Space
  // (explicit) still produces the full list at non-word positions.
  if (!word && !context.explicit) return null;
  const options = [
    ...uniformCompletions(context.state.doc.toString()),
    ...STATIC_BASE,
  ];
  return {
    from: word ? word.from : context.pos,
    options,
    validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
  };
}

export function glslAutocomplete(): Extension {
  return autocompletion({
    override: [hintSource, glslSource],
    activateOnTyping: true,
  });
}
