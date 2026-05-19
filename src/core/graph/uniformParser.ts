// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + regex captures / line walk bounds
type UniformType =
  | "float"
  | "vec2"
  | "vec3"
  | "vec4"
  | "int"
  | "ivec2"
  | "ivec3"
  | "ivec4"
  | "bool"
  | "mat2"
  | "mat3"
  | "mat4"
  | "sampler2D"
  | "samplerCube";

export interface UniformSpec {
  name: string;
  type: UniformType;
  /** Inspector hint inferred from name: regular numeric vs color picker */
  control: "slider" | "multi" | "color" | "sampler" | "matrix" | "bool";
  /** True when matched against the system-uniform allowlist */
  system: boolean;
  /** Default UI range for sliders */
  min: number;
  max: number;
  step: number;
  defaultValue: number | number[];
  /** Optional human-readable label overriding the name */
  label?: string;
}

export const SYSTEM_UNIFORMS = new Set([
  "u_time",
  "u_resolution",
  "u_view",
  "u_proj",
  "u_model",
  "u_camera",
]);

/**
 * Short human-readable descriptions for each system uniform. Surfaced in the
 * Inspector to explain why these names are auto-injected and don't appear as
 * graph input ports. Keep keys in sync with SYSTEM_UNIFORMS.
 */
export const SYSTEM_UNIFORM_DESCRIPTIONS: Record<string, string> = {
  u_time: "렌더 시작부터의 경과 시간(초)",
  u_resolution: "렌더 타깃 픽셀 크기 (width, height)",
  u_view: "카메라 view 행렬 (fullscreen 패스에서는 미적용)",
  u_proj: "카메라 projection 행렬",
  u_model: "오브젝트 model 행렬",
  u_camera: "카메라 월드 위치 (fullscreen 패스에서는 미적용)",
};

const VEC_LEN: Record<string, number> = {
  vec2: 2,
  vec3: 3,
  vec4: 4,
  ivec2: 2,
  ivec3: 3,
  ivec4: 4,
};

function isColorName(name: string): boolean {
  return /color/i.test(name);
}

function defaultRangeFor(
  type: UniformType,
  name: string,
): { min: number; max: number; step: number; defaultValue: number | number[] } {
  if (type === "float") {
    if (/intensity|strength|amount|opacity|alpha/i.test(name)) {
      return { min: 0, max: 1, step: 0.001, defaultValue: 0.5 };
    }
    if (/scale|frequency|radius/i.test(name)) {
      return { min: 0, max: 10, step: 0.01, defaultValue: 1 };
    }
    return { min: -1, max: 1, step: 0.002, defaultValue: 0 };
  }
  if (type.startsWith("vec")) {
    const len = VEC_LEN[type] ?? 3;
    if (isColorName(name)) {
      const def = len === 4 ? [1, 1, 1, 1] : [1, 1, 1];
      return { min: 0, max: 1, step: 0.001, defaultValue: def };
    }
    return {
      min: -1,
      max: 1,
      step: 0.002,
      defaultValue: new Array(len).fill(0),
    };
  }
  if (type === "int") return { min: 0, max: 10, step: 1, defaultValue: 0 };
  if (type === "bool") return { min: 0, max: 1, step: 1, defaultValue: 0 };
  return { min: 0, max: 1, step: 0.001, defaultValue: 0 };
}

const RE_UNIFORM =
  /^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*(?:\[(\d+)\])?\s*;/;

export interface UniformHints {
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number | number[];
  label?: string;
  /**
   * Explicit control override. `@color` forces the color picker even when the
   * uniform name does not match the color-name pattern; `@slider` / `@multi`
   * forces a numeric layout even when the name would have inferred a color.
   */
  control?: "color" | "slider" | "multi";
}

/**
 * Parses GLSL annotation comments. Hints may appear on the same line as the
 * uniform declaration (after `//`) or on the line immediately preceding it.
 *
 *   uniform float u_x; // @range 0..10 @step 0.1 @default 3
 *   // @range -1..1
 *   uniform float u_y;
 *
 * Supported keys:
 *   @range LO..HI  | @min LO @max HI
 *   @step S
 *   @default V or @default V1,V2,V3
 *   @label "Human readable"
 *   @color  | @slider | @multi   (override the name-based control inference)
 */
export function parseHintComment(text: string): UniformHints {
  const hints: UniformHints = {};
  if (!text) return hints;

  const rangeMatch =
    /@range\s+(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (rangeMatch) {
    hints.min = parseFloat(rangeMatch[1]!);
    hints.max = parseFloat(rangeMatch[2]!);
  }
  const minMatch = /@min\s+(-?\d+(?:\.\d+)?)/.exec(text);
  if (minMatch) hints.min = parseFloat(minMatch[1]!);
  const maxMatch = /@max\s+(-?\d+(?:\.\d+)?)/.exec(text);
  if (maxMatch) hints.max = parseFloat(maxMatch[1]!);

  const stepMatch = /@step\s+(-?\d+(?:\.\d+)?)/.exec(text);
  if (stepMatch) hints.step = parseFloat(stepMatch[1]!);

  const defMatch = /@default\s+([^@\n]+)/.exec(text);
  if (defMatch) {
    const raw = defMatch[1]!.trim();
    if (raw.includes(",")) {
      const parts = raw
        .split(/[ ,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseFloat(s))
        .filter((n) => !Number.isNaN(n));
      if (parts.length) hints.defaultValue = parts;
    } else {
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) hints.defaultValue = n;
    }
  }

  const labelMatch = /@label\s+(?:"([^"]+)"|([^\n@]+))/.exec(text);
  if (labelMatch) {
    const v = (labelMatch[1] ?? labelMatch[2] ?? "").trim();
    if (v) hints.label = v;
  }

  // Explicit control override. Last-write-wins so `@slider` after `@color`
  // (or vice versa) on the same line behaves predictably.
  const controlOrder: Array<{
    re: RegExp;
    value: NonNullable<UniformHints["control"]>;
  }> = [
    { re: /@color\b/g, value: "color" },
    { re: /@slider\b/g, value: "slider" },
    { re: /@multi\b/g, value: "multi" },
  ];
  let bestIndex = -1;
  for (const { re, value } of controlOrder) {
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
    while ((m = re.exec(text)) !== null) {
      if (m.index > bestIndex) {
        bestIndex = m.index;
        hints.control = value;
      }
    }
  }

  return hints;
}

function applyHints(spec: UniformSpec, hints: UniformHints): UniformSpec {
  const out = { ...spec };

  // Apply control override first so range/default fixups below match the
  // chosen control. Only valid for non-sampler, non-matrix, non-bool specs.
  if (
    hints.control &&
    spec.control !== "sampler" &&
    spec.control !== "matrix" &&
    spec.control !== "bool"
  ) {
    if (
      hints.control === "color" &&
      (spec.type === "vec3" || spec.type === "vec4")
    ) {
      out.control = "color";
      // If the previous inference didn't already treat this as a color, the
      // default range was the generic [-1,1] with a zero vector; promote it
      // to the color-friendly [0,1] white default.
      if (spec.control !== "color") {
        out.min = 0;
        out.max = 1;
        out.step = 0.001;
        const len = spec.type === "vec4" ? 4 : 3;
        out.defaultValue = new Array(len).fill(1);
      }
    } else if (hints.control === "slider" && spec.type === "float") {
      out.control = "slider";
    } else if (
      hints.control === "multi" &&
      (spec.type === "vec2" || spec.type === "vec3" || spec.type === "vec4")
    ) {
      out.control = "multi";
      // Switching color → multi reverts to the generic numeric range.
      if (spec.control === "color") {
        out.min = -1;
        out.max = 1;
        out.step = 0.002;
        const len = VEC_LEN[spec.type] ?? 3;
        out.defaultValue = new Array(len).fill(0);
      }
    }
  }

  if (hints.min !== undefined) out.min = hints.min;
  if (hints.max !== undefined) out.max = hints.max;
  if (hints.step !== undefined) out.step = hints.step;
  if (hints.label !== undefined) out.label = hints.label;
  if (hints.defaultValue !== undefined) {
    if (Array.isArray(out.defaultValue) && Array.isArray(hints.defaultValue)) {
      const target = out.defaultValue.slice();
      for (let i = 0; i < target.length; i++) {
        if (hints.defaultValue[i] !== undefined)
          target[i] = hints.defaultValue[i]!;
      }
      out.defaultValue = target;
    } else if (
      typeof out.defaultValue === "number" &&
      typeof hints.defaultValue === "number"
    ) {
      out.defaultValue = hints.defaultValue;
    }
  }
  return out;
}

export function parseUniforms(source: string): UniformSpec[] {
  const out: UniformSpec[] = [];
  const seen = new Set<string>();
  // Walk line by line, BUT preserve trailing line comments and look back at
  // the previous comment-only line for hint annotations.
  const rawLines = source.split(/\r?\n/);
  // Strip block comments globally so they don't break the line walk; convert
  // them into spaces but preserve newline count.
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  const lines = noBlock.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Drop *inline* comments AFTER we capture them for hint parsing
    const commentIdx = line.indexOf("//");
    const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const trailingComment = commentIdx >= 0 ? line.slice(commentIdx) : "";

    const m = RE_UNIFORM.exec(code);
    if (!m) continue;
    const type = m[1] as UniformType;
    const name = m[2]!;
    if (seen.has(name)) continue;
    seen.add(name);

    const isColor =
      type.startsWith("vec") &&
      (type === "vec3" || type === "vec4") &&
      isColorName(name);
    const isSampler = type === "sampler2D" || type === "samplerCube";
    const isMatrix = type.startsWith("mat");

    let control: UniformSpec["control"] = "slider";
    if (isSampler) control = "sampler";
    else if (isMatrix) control = "matrix";
    else if (type === "bool") control = "bool";
    else if (isColor) control = "color";
    else if (type === "float" || type === "int") control = "slider";
    else control = "multi";

    const { min, max, step, defaultValue } = defaultRangeFor(type, name);

    let spec: UniformSpec = {
      name,
      type,
      control,
      system: SYSTEM_UNIFORMS.has(name),
      min,
      max,
      step,
      defaultValue,
    };

    // Pull hints from the trailing inline comment AND from any preceding
    // comment-only lines (walk back until a non-comment, non-blank line).
    const hintParts: string[] = [];
    if (trailingComment) hintParts.push(trailingComment);
    for (let j = i - 1; j >= 0; j--) {
      const prev = rawLines[j]!.trim();
      if (!prev) continue;
      if (prev.startsWith("//")) {
        hintParts.unshift(prev);
        continue;
      }
      break;
    }
    const hints = parseHintComment(hintParts.join("\n"));
    spec = applyHints(spec, hints);

    out.push(spec);
  }
  return out;
}

/** Visible uniforms: not system, not sampler. */
export function inspectorUniforms(specs: UniformSpec[]): UniformSpec[] {
  return specs.filter(
    (u) => !u.system && u.control !== "sampler" && u.control !== "matrix",
  );
}

/** Sampler uniforms: become input ports, not Inspector controls. */
export function samplerUniforms(specs: UniformSpec[]): UniformSpec[] {
  return specs.filter((u) => u.control === "sampler");
}
