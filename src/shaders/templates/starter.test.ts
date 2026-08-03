import { describe, expect, it } from "vitest";
import { parseUniforms } from "../../core/graph/uniformParser";
import basicVert from "../basic.vert?raw";
import fullscreenVert from "../fullscreen.vert?raw";
import starterFrag from "./starter.frag?raw";
import unlitFrag from "./unlit.frag?raw";

/**
 * [C-7] A new Shader node is always born without a mesh input, and
 * compile.ts substitutes fullscreen.vert for mesh-less shader passes. In
 * GLSL ES 3.0 every fragment-stage `in` must be matched by a vertex-stage
 * `out` or the program fails to link — so the default template for a new node
 * must not read a varying fullscreen.vert doesn't emit.
 *
 * These are text assertions rather than a real link: WebGL2 linking needs a GL
 * context, which the jsdom unit environment has no access to (the Playwright
 * suite covers the real pipeline). The varying contract is what actually broke,
 * and it is statically checkable.
 */
function declaredVaryings(src: string, qualifier: "in" | "out"): string[] {
  // Matches e.g. `in vec3 v_normal;` — deliberately ignores `in vec3
  // a_position` attributes in the vertex stage by only being applied to a
  // fragment source for "in", and skips uniforms/precision lines.
  const re = new RegExp(`^\\s*${qualifier}\\s+\\w+\\s+(\\w+)\\s*;`, "gm");
  return [...src.matchAll(re)].map((m) => m[1] ?? "");
}

const fullscreenOuts = declaredVaryings(fullscreenVert, "out");
const basicOuts = declaredVaryings(basicVert, "out");

describe("new-node shader template varying contract [C-7]", () => {
  it("fullscreen.vert emits only v_uv (the constraint every mesh-less node hits)", () => {
    expect(fullscreenOuts).toEqual(["v_uv"]);
  });

  it("starter.frag links against fullscreen.vert — the mesh-less first frame", () => {
    for (const v of declaredVaryings(starterFrag, "in")) {
      expect(fullscreenOuts).toContain(v);
    }
  });

  it("starter.frag still links against basic.vert once a mesh is connected", () => {
    // A vertex shader may emit varyings the fragment ignores; only the reverse
    // is a link error. So the starter must keep working after the user wires a
    // mesh in and compile.ts stops substituting fullscreen.vert.
    for (const v of declaredVaryings(starterFrag, "in")) {
      expect(basicOuts).toContain(v);
    }
  });

  it("documents why unlit.frag cannot be the new-node default: it reads a varying fullscreen.vert never emits", () => {
    // This is the actual C-7 defect, pinned so nobody restores unlit.frag as
    // the default for CTA / Add Shader. unlit stays the *mesh* template (demo
    // graph + the explicit "Add Shader: Unlit" command), where basic.vert
    // supplies v_normal.
    const unlitIns = declaredVaryings(unlitFrag, "in");
    expect(unlitIns).toContain("v_normal");
    expect(fullscreenOuts).not.toContain("v_normal");
    for (const v of unlitIns) {
      expect(basicOuts).toContain(v);
    }
  });
});

/**
 * [Q1-b] starter.frag's default output was promoted from an interim visual
 * to the design-canon recipe in v1.3 (the 'New Shader' demo card in
 * design/Node Editor.dc.html): a u_baseColor central soft glow + a dark
 * vignette + a subtle u_time modulation. [R14] The dc CSS gradient stops are
 * ported as a recipe, not matched stop-for-stop, so these are text
 * assertions pinning the recipe's presence rather than a pixel/GL
 * comparison — same rationale as the varying-contract tests above: jsdom has
 * no WebGL2 context to actually link/render against.
 */
describe("starter.frag default-output recipe [Q1-b]", () => {
  it("still consumes only u_time and u_baseColor (uniform contract with palette/toolbar/CTA)", () => {
    expect(starterFrag).toMatch(/\bu_baseColor\b/);
    expect(starterFrag).toMatch(/\bu_time\b/);
  });

  it("keeps the central glow term (smoothstep-based)", () => {
    expect(starterFrag).toMatch(/\bsmoothstep\s*\(/);
  });

  it("adds the dark vignette term without introducing new uniforms", () => {
    expect(starterFrag).toMatch(/\bvignette\b/);
  });

  it("does not widen the varying contract — starter.frag still declares only v_uv as `in`", () => {
    // Stronger than the [C-7] "contains v_uv" checks above: pins the exact
    // set so the vignette recipe can't accidentally grow the varying list.
    expect(declaredVaryings(starterFrag, "in")).toEqual(["v_uv"]);
  });

  it("declares u_baseColor's initial value as an explicit @default (T3/C-2)", () => {
    // The uniform-injection code paths (AddNodePill/CommandPalette) create
    // new Shader nodes with `uniformValues: {}` — this hint, not a hardcoded
    // value in TS, is what compile.ts's withExplicitDefaults reads to seed
    // the pass and reproduce the same first-frame glow.
    const spec = parseUniforms(starterFrag).find(
      (u) => u.name === "u_baseColor",
    );
    expect(spec?.hasExplicitDefault).toBe(true);
    expect(spec?.defaultValue).toEqual([0.5, 0.7, 1.0]);
  });

  it("declares unlit.frag's u_baseColor @default too (T3/C-2 regression)", () => {
    // `Add Shader: Unlit` runs the same generic template path that used to
    // hardcode `uniformValues: { u_baseColor: [0.5, 0.7, 1.0] }` for every
    // template. C-2 removed that seed in favour of GLSL hints, so a template
    // that declares u_baseColor without a hint falls through to GL zero and
    // the new node renders near-black — which is deletion, not migration.
    const spec = parseUniforms(unlitFrag).find((u) => u.name === "u_baseColor");
    expect(spec?.hasExplicitDefault).toBe(true);
    expect(spec?.defaultValue).toEqual([0.5, 0.7, 1.0]);
  });
});
