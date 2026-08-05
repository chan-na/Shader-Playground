/**
 * Mirrors the system-uniform binding decisions actually made at render time
 * by `src/core/graph/execute.ts`:
 *
 *  - `bindComputeSystemUniforms` (execute.ts:130-138) — a compute pass only
 *    ever binds `u_time`/`u_frame`. Every other system uniform name is never
 *    touched for a compute program.
 *  - `bindSystemUniforms` (execute.ts:140-171) — a shader pass always binds
 *    `u_time`/`u_resolution`/`u_mouse`/`u_frame`, but
 *    `u_view`/`u_proj`/`u_model`/`u_camera` are gated on
 *    `!pass.meshIsFullscreen` (execute.ts:162).
 *
 * [C-1] The Inspector uses this to show, per uniform, whether *this* frame's
 * draw actually sets it — rather than re-deriving the rule a second time (and
 * risking drift) or guessing from the graph shape.
 *
 * [#10] Both binders above run *per pass*, so a node that produced no pass at
 * all (`compile.ts` `continue`s before `passes.push` when the program fails to
 * build, or when a compute-driven VAO can't be allocated) has nothing bound
 * for any name — a shader error is not fatal validation, so the plan is still
 * published with that one node's row missing. `hasPass` carries that fact in.
 */
export interface SystemUniformBindingInfo {
  bound: boolean;
  note?: string;
}

/** execute.ts:162 — the four system uniforms gated by fullscreen substitution. */
const VIEW_DEPENDENT = new Set(["u_view", "u_proj", "u_model", "u_camera"]);

/** execute.ts:136-137 — the only two system uniforms a compute pass binds. */
const COMPUTE_BOUND = new Set(["u_time", "u_frame"]);

/**
 * Whether `name` is bound for a node of `ownerKind`, and why not when it
 * isn't. `isFullscreen` only matters for `ownerKind === "shader"` (mirrors
 * `pass.meshIsFullscreen`, compute passes have no such notion). `hasPass` is
 * whether the published plan actually contains a pass for this node.
 *
 * The per-name rules are checked *before* `hasPass` on purpose: when a node is
 * fullscreen-substituted and its program then fails to link, "not bound
 * (fullscreen pass)" is both true and the more actionable of the two reasons,
 * so `u_view` keeps naming the substitution rather than being flattened into
 * the generic no-pass note.
 *
 * Each branch below returns a fresh literal — never spreads `undefined` into
 * `note` — so this satisfies `exactOptionalPropertyTypes` without needing a
 * conditional-spread helper.
 */
export function systemUniformBinding(
  name: string,
  ownerKind: "shader" | "compute",
  isFullscreen: boolean,
  hasPass: boolean,
): SystemUniformBindingInfo {
  if (ownerKind === "compute") {
    if (!COMPUTE_BOUND.has(name)) {
      return { bound: false, note: "not bound (compute pass)" };
    }
  } else if (VIEW_DEPENDENT.has(name) && isFullscreen) {
    return { bound: false, note: "not bound (fullscreen pass)" };
  }
  if (!hasPass) {
    return { bound: false, note: "not bound (no pass for this node)" };
  }
  return { bound: true };
}
