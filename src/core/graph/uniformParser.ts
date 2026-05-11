export type UniformType =
  | 'float'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'int'
  | 'ivec2'
  | 'ivec3'
  | 'ivec4'
  | 'bool'
  | 'mat2'
  | 'mat3'
  | 'mat4'
  | 'sampler2D'
  | 'samplerCube';

export interface UniformSpec {
  name: string;
  type: UniformType;
  /** Inspector hint inferred from name: regular numeric vs color picker */
  control: 'slider' | 'multi' | 'color' | 'sampler' | 'matrix' | 'bool';
  /** True when matched against the system-uniform allowlist */
  system: boolean;
  /** Default UI range for sliders */
  min: number;
  max: number;
  defaultValue: number | number[];
}

export const SYSTEM_UNIFORMS = new Set([
  'u_time',
  'u_resolution',
  'u_view',
  'u_proj',
  'u_model',
  'u_camera',
]);

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

function defaultRangeFor(type: UniformType, name: string): { min: number; max: number; defaultValue: number | number[] } {
  if (type === 'float') {
    if (/intensity|strength|amount|opacity|alpha/i.test(name)) {
      return { min: 0, max: 1, defaultValue: 0.5 };
    }
    if (/scale|frequency|radius/i.test(name)) {
      return { min: 0, max: 10, defaultValue: 1 };
    }
    return { min: -1, max: 1, defaultValue: 0 };
  }
  if (type.startsWith('vec')) {
    const len = VEC_LEN[type] ?? 3;
    if (isColorName(name)) {
      const def = len === 4 ? [1, 1, 1, 1] : [1, 1, 1];
      return { min: 0, max: 1, defaultValue: def };
    }
    return { min: -1, max: 1, defaultValue: new Array(len).fill(0) };
  }
  if (type === 'int') return { min: 0, max: 10, defaultValue: 0 };
  if (type === 'bool') return { min: 0, max: 1, defaultValue: 0 };
  return { min: 0, max: 1, defaultValue: 0 };
}

const RE_UNIFORM = /^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*(?:\[(\d+)\])?\s*;/;

export function parseUniforms(source: string): UniformSpec[] {
  const out: UniformSpec[] = [];
  const seen = new Set<string>();
  // Strip block + line comments to avoid matching commented-out uniforms.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  for (const line of stripped.split(/\r?\n/)) {
    const m = RE_UNIFORM.exec(line);
    if (!m) continue;
    const type = m[1] as UniformType;
    const name = m[2];
    if (seen.has(name)) continue;
    seen.add(name);

    const isColor = type.startsWith('vec') && (type === 'vec3' || type === 'vec4') && isColorName(name);
    const isSampler = type === 'sampler2D' || type === 'samplerCube';
    const isMatrix = type.startsWith('mat');

    let control: UniformSpec['control'] = 'slider';
    if (isSampler) control = 'sampler';
    else if (isMatrix) control = 'matrix';
    else if (type === 'bool') control = 'bool';
    else if (isColor) control = 'color';
    else if (type === 'float' || type === 'int') control = 'slider';
    else control = 'multi';

    const { min, max, defaultValue } = defaultRangeFor(type, name);

    out.push({
      name,
      type,
      control,
      system: SYSTEM_UNIFORMS.has(name),
      min,
      max,
      defaultValue,
    });
  }
  return out;
}

/** Visible uniforms: not system, not sampler. */
export function inspectorUniforms(specs: UniformSpec[]): UniformSpec[] {
  return specs.filter((u) => !u.system && u.control !== 'sampler' && u.control !== 'matrix');
}

/** Sampler uniforms: become input ports, not Inspector controls. */
export function samplerUniforms(specs: UniformSpec[]): UniformSpec[] {
  return specs.filter((u) => u.control === 'sampler');
}
