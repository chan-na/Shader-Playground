import type { UniformSpec } from "./uniformParser";

/**
 * A uniform whose declaration says one thing while the compiled/linked
 * program (or the graph's wiring) silently does another (E-1). Both cases
 * are pre-existing "quiet skip" behavior in the GL layer —
 * `core/gl/uniforms.ts`'s `loc === null` early-return for an inactive
 * uniform, and `execute.ts`'s `bindSamplers` only binding the *connected*
 * `pass.samplers`, leaving an unconnected sampler uniform untouched — this
 * module only *names* what already happens.
 */
export interface SilentUniformWarning {
  uniformName: string;
  kind: "sampler-unconnected" | "uniform-inactive";
}

/**
 * Compares a shader's declared uniforms against what the linked program
 * actually kept active and what the graph actually wired up, in declaration
 * order. A uniform can only earn one warning:
 *  - not active in the linked program → `uniform-inactive` (the GLSL
 *    optimizer may have stripped it because it's unused, or the name may be
 *    a typo that never matched the source — this module cannot tell the two
 *    apart, hence the non-assertive wording in {@link silentWarningMessage}).
 *  - active, a sampler, but not bound to any incoming edge →
 *    `sampler-unconnected`. What it samples is *not* guaranteed to be black:
 *    the uniform keeps its link-time default 0, so it reads texture unit 0.
 *    That is (0,0,0,0) only when nothing is bound there — if the same pass
 *    has any connected sampler, compile.ts's unit assignment (`let unit = 0`)
 *    puts that first texture on unit 0 and the unconnected sampler silently
 *    reads it instead. Hence the non-assertive wording in
 *    {@link silentWarningMessage} for this kind as well.
 */
export function computeSilentUniformWarnings(
  declared: UniformSpec[],
  activeUniformNames: ReadonlySet<string>,
  boundUniformNames: ReadonlySet<string>,
): SilentUniformWarning[] {
  const out: SilentUniformWarning[] = [];
  for (const u of declared) {
    if (!activeUniformNames.has(u.name)) {
      out.push({ uniformName: u.name, kind: "uniform-inactive" });
      continue;
    }
    if (u.control === "sampler" && !boundUniformNames.has(u.name)) {
      out.push({ uniformName: u.name, kind: "sampler-unconnected" });
    }
  }
  return out;
}

/** Human-readable message for a single warning, for ProblemsPanel rows. */
export function silentWarningMessage(w: SilentUniformWarning): string {
  if (w.kind === "sampler-unconnected") {
    return `${w.uniformName}: sampler가 선언됐지만 연결된 입력이 없습니다 — 아무 텍스처도 바인딩되지 않아 검은색(0,0,0,0) 또는 같은 패스의 다른 텍스처(유닛 0)가 샘플링될 수 있습니다.`;
  }
  return `${w.uniformName}: 선언됐지만 링크된 프로그램에는 존재하지 않습니다 — 코드에서 사용되지 않아 최적화로 제거됐거나, 이름 오타일 수 있습니다.`;
}
