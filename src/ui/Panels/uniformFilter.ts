import type { UniformSpec } from "../../core/graph/uniformParser";

export function normalizeUniformQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function matchesUniformQuery(
  spec: UniformSpec,
  normalized: string,
): boolean {
  if (!normalized) return true;
  if (spec.name.toLowerCase().includes(normalized)) return true;
  if (spec.label?.toLowerCase().includes(normalized)) return true;
  if (spec.type.toLowerCase().includes(normalized)) return true;
  return false;
}

export function filterUniforms<T extends UniformSpec>(
  specs: readonly T[],
  query: string,
): T[] {
  const normalized = normalizeUniformQuery(query);
  if (!normalized) return [...specs];
  return specs.filter((spec) => matchesUniformQuery(spec, normalized));
}
