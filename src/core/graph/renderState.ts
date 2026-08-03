/**
 * Single source of truth for a shader pass's GL render state (E-2,
 * `docs/learnability-plan-2026-08.md` T3). Before this module existed,
 * `execute.ts` decided depth/cull state inline and the Pass Inspector UI had
 * no way to show it without hand-copying the same logic into a string —
 * exactly the kind of drift this round exists to remove. `execute.ts`'s
 * `applyRenderState` call and `PassInspector.tsx`'s `State` column both
 * derive from {@link renderStateFor}, so a future change here reaches both
 * consumers for free instead of silently going stale in one of them.
 *
 * Current values, fixed by what the rest of the codebase actually does
 * today:
 *  - `depthTest` is the only field that varies: off for a fullscreen quad
 *    pass (2D compositing — there is nothing behind anything), on for a
 *    mesh-connected pass (3D geometry needs occlusion). This mirrors the
 *    `pass.meshIsFullscreen` branch `execute.ts` used to have inline.
 *  - `cull` is always `false` — face culling has never been exposed as a
 *    node or port (L4), so there is no graph state that could turn it on.
 *  - `blend` is always `false` for the same reason: no `gl.enable(gl.BLEND)`
 *    call exists anywhere in this repository, so no *in-pass* alpha blending
 *    ever happens. That does **not** mean `outColor.a` is discarded: the
 *    alpha is written into the pass's FBO — downstream samplers read it back
 *    — and the composite pass carries it into the default framebuffer, where
 *    the canvas context (`alpha:true` default + `premultipliedAlpha:false`,
 *    see `core/gl/context.ts`) hands it to the browser's page compositor.
 *    Measured: `outColor.a = 0.0` lets the page background show through the
 *    viewport. `applyRenderState` still calls `gl.disable(gl.BLEND)`
 *    explicitly every pass rather than relying on the WebGL default (which
 *    is already disabled) — the goal is an explicit, greppable state write,
 *    not a behavior change.
 */
export interface PassRenderState {
  blend: boolean;
  cull: boolean;
  depthTest: boolean;
}

/**
 * Derives the render state for a shader pass from the one fact `compile.ts`
 * already tracks per pass: whether its mesh was substituted with the
 * fullscreen quad. See the module doc above for why `blend`/`cull` are
 * constant.
 */
export function renderStateFor(meshIsFullscreen: boolean): PassRenderState {
  return {
    blend: false,
    cull: false,
    depthTest: !meshIsFullscreen,
  };
}

/** Applies a {@link PassRenderState} to `gl`. Each field is an explicit
 * enable/disable pair (no reliance on a WebGL default) so the actual GL
 * calls this makes are legible from the state values alone. */
export function applyRenderState(
  gl: WebGL2RenderingContext,
  s: PassRenderState,
): void {
  if (s.depthTest) gl.enable(gl.DEPTH_TEST);
  else gl.disable(gl.DEPTH_TEST);
  if (s.cull) gl.enable(gl.CULL_FACE);
  else gl.disable(gl.CULL_FACE);
  if (s.blend) gl.enable(gl.BLEND);
  else gl.disable(gl.BLEND);
}
