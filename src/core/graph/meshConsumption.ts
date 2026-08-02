/**
 * Per-attribute consumption verdict for a mesh's attribute contract (B-2),
 * aggregated across every shader pass currently wired to that mesh's output.
 *  - `"unknown"`: no consumer information at all — either nothing consumes
 *    this mesh yet, or none of its consumers declared this attribute name.
 *    Deliberately distinct from `"skipped"`: a mesh with no consumers isn't
 *    wrong, it's just unobserved, and the app must not warn about it.
 *  - `"consumed"`: at least one consumer's linked program bound it.
 *  - `"skipped"`: at least one consumer knows the attribute name but no
 *    consumer's program bound it — the quiet skip in `core/gl/mesh.ts`
 *    (`loc === undefined || loc < 0`) made visible.
 */
export type MeshAttrStatus = "consumed" | "skipped" | "unknown";

/**
 * Aggregates `ShaderPass.meshAttributeUse` (one array per consuming shader
 * pass) against a mesh's attribute contract. "Any consumer" semantics: an
 * attribute wired into two shaders, one using it and one not, still counts
 * as `"consumed"` — the mesh data itself is fine, and the unused case is
 * that *consumer's* problem to flag (already visible in its own row).
 */
export function aggregateMeshConsumption(
  contractAttrs: ReadonlyArray<{ name: string }>,
  consumerUses: ReadonlyArray<
    ReadonlyArray<{ name: string; consumed: boolean }>
  >,
): Record<string, MeshAttrStatus> {
  const out: Record<string, MeshAttrStatus> = {};
  for (const attr of contractAttrs) {
    let seen = false;
    let anyConsumed = false;
    for (const uses of consumerUses) {
      const match = uses.find((u) => u.name === attr.name);
      if (!match) continue;
      seen = true;
      if (match.consumed) anyConsumed = true;
    }
    if (!seen) out[attr.name] = "unknown";
    else out[attr.name] = anyConsumed ? "consumed" : "skipped";
  }
  return out;
}
