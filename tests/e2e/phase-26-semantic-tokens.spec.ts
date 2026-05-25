import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { withSp } from "./helpers/sp";

// Phase 26 — Semantic token highlighting.
//
// Two layers exercised:
//   (a) `__sp.glslSemanticTokens.classify(source)` — pure classifier output.
//       Tests assert token kind + the substring at from/to.
//   (b) CodeMirror end-to-end — paste a known fragment into the demo shader,
//       wait for the editor to mount it, and assert the rendered DOM has
//       `cm-glsl-token-<kind>` spans at the expected text.

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform float u_strength;
out vec4 outColor;

float hash(vec2 p) {
  return fract(p.x * p.y * 1234.5);
}

void main() {
  float n = hash(v_uv * 10.0);
  vec3 col = vec3(n) * u_strength * sin(u_time);
  outColor = vec4(col, 1.0);
}
`;

test.describe("Phase 26 — GLSL semantic token highlighting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("classify() tags identifier roles — user uniform, system uniform, builtin, function, parameter, in", async ({
    page,
  }) => {
    const tokens = await withSp(
      page,
      (sp, args: { src: string }) =>
        sp.glslSemanticTokens.classify(args.src).map((t) => ({
          text: args.src.slice(t.from, t.to),
          kind: t.kind,
        })),
      { src: FRAG },
    );

    // Build a {firstSeenText -> kind} index. Same name → same kind regardless
    // of occurrence count.
    const byName = new Map<string, string>();
    for (const t of tokens) if (!byName.has(t.text)) byName.set(t.text, t.kind);

    // User uniform — name doesn't match SYSTEM_UNIFORMS.
    expect(byName.get("u_strength")).toBe("uniform");
    // System uniform — auto-bound by the runtime.
    expect(byName.get("u_time")).toBe("system-uniform");
    // `in` global.
    expect(byName.get("v_uv")).toBe("in");
    // `out` global.
    expect(byName.get("outColor")).toBe("out");
    // User-defined function.
    expect(byName.get("hash")).toBe("function-user");
    expect(byName.get("main")).toBe("function-user");
    // Builtin calls.
    expect(byName.get("fract")).toBe("function-builtin");
    expect(byName.get("vec3")).toBeUndefined(); // type keyword — handled by lexer
    expect(byName.get("sin")).toBe("function-builtin");
    // Function parameter usage inside hash() body.
    expect(byName.get("p")).toBe("parameter");
  });

  test("locals stay unclassified (default editor color)", async ({ page }) => {
    const localTokens = await withSp(
      page,
      (sp, args: { src: string }) =>
        sp.glslSemanticTokens
          .classify(args.src)
          .filter(
            (t) =>
              args.src.slice(t.from, t.to) === "n" ||
              args.src.slice(t.from, t.to) === "col",
          ),
      { src: FRAG },
    );
    // Neither `n` nor `col` should appear in the token stream — they're
    // locals and the classifier returns null for them so the editor falls
    // back to its default identifier color.
    expect(localTokens).toHaveLength(0);
  });

  test("CodeMirror renders cm-glsl-token-* spans for highlighted identifiers", async ({
    page,
  }) => {
    // Inject the fragment source into the demo shader node so the editor
    // picks it up — mirrors the pattern in phase-25-glsl-lsp.spec.ts.
    await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      if (!node) throw new Error("no shader node");
      sp.selection.getState().select(node.id);
      sp.graph.getState().updateShaderSource(node.id, { fragmentSource: src });
    }, FRAG);

    // Switch to the fragment tab and wait for the editor content to include
    // the new source.
    await page.getByTestId("stage-tab-fragment").click();
    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_strength"))
      .toBe(true);

    // System uniform — orange.
    const systemSpan = content
      .locator(".cm-glsl-token-system-uniform")
      .filter({ hasText: "u_time" })
      .first();
    await expect(systemSpan).toBeVisible();

    // User uniform — teal.
    const uniformSpan = content
      .locator(".cm-glsl-token-uniform")
      .filter({ hasText: "u_strength" })
      .first();
    await expect(uniformSpan).toBeVisible();

    // Builtin call — light green.
    const builtinSpan = content
      .locator(".cm-glsl-token-function-builtin")
      .filter({ hasText: "sin" })
      .first();
    await expect(builtinSpan).toBeVisible();

    // User function — yellow.
    const userFnSpan = content
      .locator(".cm-glsl-token-function-user")
      .filter({ hasText: "hash" })
      .first();
    await expect(userFnSpan).toBeVisible();
  });

  test("token stream is sorted by document offset (RangeSetBuilder contract)", async ({
    page,
  }) => {
    const sorted = await withSp(
      page,
      (sp, args: { src: string }) => {
        const tokens = sp.glslSemanticTokens.classify(args.src);
        for (let i = 1; i < tokens.length; i++) {
          if (tokens[i]!.from < tokens[i - 1]!.from) return false;
        }
        return true;
      },
      { src: FRAG },
    );
    expect(sorted).toBe(true);
  });
});
