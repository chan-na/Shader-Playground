import { inspectorUniforms, parseUniforms } from "./uniformParser";

/**
 * Seeds a compiled pass's `uniformValues` from GLSL `@default` hints
 * (`docs/learnability-plan-2026-08.md` C-2).
 *
 * Invariant (must hold for every caller): **stored value > GLSL `@default` >
 * GL zero.** A brand-new Shader/Compute node is created with
 * `uniformValues: {}` — no hardcoded seed values live in node-creation code,
 * so the system never secretly injects a value. Its visible defaults come
 * entirely from `@default` hints declared in the shader source. An
 * already-stored value (loaded project, autosave, share URL, or a demo's
 * intentional art direction) must always win — this function's
 * `{ ...seeded, ...stored }`
 * spread order is what guarantees that.
 *
 * Two call sites, two shapes:
 *  - `compile.ts` calls it with `stored = {}` to compute a pure seed map for
 *    the pass's `seededDefaults` field. The live render path *cannot* use
 *    the merged shape: the Viewport hot-patches
 *    `pass.uniformValues = node.uniformValues` every frame, so a merged-in
 *    seed would be clobbered before the first draw — `bindUserUniforms`
 *    re-composes `{...seededDefaults, ...uniformValues}` per frame instead.
 *  - `htmlExport.ts` calls it with the node's real stored values to
 *    materialize effective uniforms at the export boundary, because the
 *    standalone player has no `@default` parser of its own.
 *
 * Only uniforms with `hasExplicitDefault` are seeded — the name-based
 * heuristic defaults (`defaultRangeFor`) are deliberately excluded. Binding
 * those too would silently change every existing project's unannotated
 * color-named uniforms from GL's zero default to white — a silent behavior
 * change for existing work.
 */
export function withExplicitDefaults(
  source: string,
  stored: Record<string, number | number[]>,
): Record<string, number | number[]> {
  const specs = inspectorUniforms(parseUniforms(source));
  const seeded: Record<string, number | number[]> = {};
  for (const spec of specs) {
    if (!spec.hasExplicitDefault) continue;
    if (spec.name in stored) continue;
    seeded[spec.name] = Array.isArray(spec.defaultValue)
      ? [...spec.defaultValue]
      : spec.defaultValue;
  }
  return { ...seeded, ...stored };
}
