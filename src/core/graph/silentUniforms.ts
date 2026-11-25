import type { UniformSpec } from "./uniformParser";

/**
 * A uniform whose declaration says one thing while the compiled/linked
 * program (or the graph's wiring) silently does another. Every case is
 * pre-existing "quiet skip" behavior in the GL layer —
 * `core/gl/uniforms.ts`'s `loc === null` early-return for an inactive
 * uniform, `execute.ts`'s `bindSamplers` only binding the *connected*
 * `pass.samplers` (leaving an unconnected sampler uniform untouched), and
 * that same loop's `continue` over a connected sampler whose source has no
 * texture yet — this module only *names* what already happens.
 */
export interface SilentUniformWarning {
  uniformName: string;
  kind: "sampler-unconnected" | "sampler-source-empty" | "uniform-inactive";
}

/**
 * Compares a shader's declared uniforms against what the linked program
 * actually kept active and what the graph actually wired up, in declaration
 * order. A uniform can only earn one warning:
 *  - not active in the linked program → `uniform-inactive`. The GLSL
 *    optimizer may have stripped it because it's unused, the name may be a
 *    typo that never matched the source, or the declaration may sit inside a
 *    preprocessor branch the compiler never took (`parseUniforms` is a line
 *    scanner and does not evaluate `#ifdef`). This module cannot tell those
 *    apart, hence the cause-neutral, non-assertive wording in
 *    {@link silentWarningMessage}.
 *  - active, a sampler, but not bound to any incoming edge →
 *    `sampler-unconnected`. What it samples is *not* guaranteed to be black:
 *    the uniform keeps its link-time default 0, so it reads texture unit 0.
 *    That is opaque black (0,0,0,1) — GLES 3.0 §3.8.13's incomplete-texture
 *    lookup result, the same value `execute.ts`'s `[0, 0, 0, 255]` placeholder
 *    uses — only when nothing is bound there. If the same pass has any
 *    connected sampler, compile.ts's unit assignment (`let unit = 0`) puts
 *    that first texture on unit 0 and the unconnected sampler silently reads
 *    it instead. Hence the non-assertive wording in
 *    {@link silentWarningMessage} for this kind as well.
 *  - active, a sampler, bound to an edge, but the source produces no texture
 *    at all this frame → `sampler-source-empty`. `execute.ts`'s
 *    `bindSamplers` `continue`s over such a unit (an image with no asset,
 *    or one whose asset never loaded, is deliberately left unbound rather
 *    than forced to black), so the uniform again keeps its link-time default
 *    0 and reads whatever unrelated texture unit 0 holds. Without this kind
 *    the mere existence of an edge would read as "bound" on every diagnostic
 *    surface — see `ui/Viewport/passPlanPublish.ts`'s `emptySourceSamplers`
 *    for how the set is derived.
 */
export function computeSilentUniformWarnings(
  declared: UniformSpec[],
  activeUniformNames: ReadonlySet<string>,
  boundUniformNames: ReadonlySet<string>,
  emptySourceSamplerNames: ReadonlySet<string>,
): SilentUniformWarning[] {
  const out: SilentUniformWarning[] = [];
  for (const u of declared) {
    if (!activeUniformNames.has(u.name)) {
      out.push({ uniformName: u.name, kind: "uniform-inactive" });
      continue;
    }
    if (u.control !== "sampler") continue;
    if (!boundUniformNames.has(u.name)) {
      out.push({ uniformName: u.name, kind: "sampler-unconnected" });
    } else if (emptySourceSamplerNames.has(u.name)) {
      out.push({ uniformName: u.name, kind: "sampler-source-empty" });
    }
  }
  return out;
}

/** Human-readable message for a single warning, for ProblemsPanel rows. */
export function silentWarningMessage(w: SilentUniformWarning): string {
  if (w.kind === "sampler-unconnected") {
    return `${w.uniformName}: sampler가 선언됐지만 연결된 입력이 없습니다 — 아무 텍스처도 바인딩되지 않아 불투명 검정(0,0,0,1) 또는 같은 패스의 다른 텍스처(유닛 0)가 샘플링될 수 있습니다.`;
  }
  if (w.kind === "sampler-source-empty") {
    return `${w.uniformName}: 엣지는 연결됐지만 소스 노드에 텍스처가 없습니다(이미지 미선택·에셋 미로드) — 이 패스에서는 아무 텍스처도 바인딩되지 않아, 유닛 0에 남아 있는 무관한 텍스처가 샘플링돼 잔상처럼 보일 수 있습니다.`;
  }
  return `${w.uniformName}: 선언됐지만 링크된 프로그램에는 존재하지 않습니다 — 미사용 최적화 제거, 이름 오타, 전처리기 분기(#ifdef)로 선언이 컴파일되지 않음 등이 원인일 수 있습니다.`;
}
