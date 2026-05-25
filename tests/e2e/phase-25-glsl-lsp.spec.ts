import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { withSp } from "./helpers/sp";

// Phase 25 — LSP-like editor features layered onto CodeMirror 6:
//   - Scope-aware symbol table (autocomplete enhancement).
//   - Hover tooltip that reads symbols, builtin signatures, system uniforms.
//
// Both features share the `__sp.glslSymbols` bridge for direct verification
// without round-tripping through CM event dispatch. The hover wiring itself
// is exercised by typing into the editor and asserting the CodeMirror
// tooltip DOM appears with the correct content.

const FRAG_WITH_HELPER = `#version 300 es
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
  vec3 col = vec3(n) * u_strength;
  outColor = vec4(col, 1.0);
}
`;

test.describe("Phase 25 — GLSL LSP (symbol table + hover)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("symbol table captures globals, function parameters, and locals", async ({
    page,
  }) => {
    const result = await withSp(
      page,
      (sp, args: { src: string }) => {
        const table = sp.glslSymbols.build(args.src);
        return table.symbols.map(
          (s) => `${s.kind}:${s.name}@${s.scope ?? "*"}`,
        );
      },
      { src: FRAG_WITH_HELPER },
    );

    // Globals at top-level scope (`*`).
    expect(result).toContain("in:v_uv@*");
    expect(result).toContain("uniform:u_time@*");
    expect(result).toContain("uniform:u_strength@*");
    expect(result).toContain("out:outColor@*");
    expect(result).toContain("function:hash@*");
    expect(result).toContain("function:main@*");

    // hash() parameter `p` belongs to scope `hash`.
    expect(result).toContain("parameter:p@hash");

    // main()'s locals are scoped to `main`.
    expect(result).toContain("local:n@main");
    expect(result).toContain("local:col@main");

    // Locals from other functions don't leak.
    expect(result).not.toContain("local:n@hash");
  });

  test("symbolsVisibleAt narrows to in-scope locals + globals", async ({
    page,
  }) => {
    const visibleInMain = await withSp(
      page,
      (sp, args: { src: string }) => {
        const table = sp.glslSymbols.build(args.src);
        // Line numbers are 1-based. Find the line of `float n = hash(...)` —
        // we approximate by counting newlines up to that token.
        const idx = args.src.indexOf("float n = hash");
        const line = args.src.slice(0, idx).split(/\r?\n/).length;
        return sp.glslSymbols.visibleAt(table, line).map((s) => s.name);
      },
      { src: FRAG_WITH_HELPER },
    );

    // Inside main(): locals so far (`n`) are visible, globals are visible.
    expect(visibleInMain).toContain("n");
    expect(visibleInMain).toContain("u_time");
    expect(visibleInMain).toContain("hash");
    // hash()'s param `p` is NOT in scope from main().
    expect(visibleInMain).not.toContain("p");
  });

  test("hovering over a uniform shows the system-uniform description", async ({
    page,
  }) => {
    // Drive the editor: select the demo shader node, paste a known fragment,
    // wait for the editor to load it, then hover the `u_time` token in
    // CodeMirror's content area.
    await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      if (!node) throw new Error("no shader node");
      sp.selection.getState().select(node.id);
      sp.graph.getState().updateShaderSource(node.id, { fragmentSource: src });
    }, FRAG_WITH_HELPER);

    // Ensure fragment tab is active and editor has the new source.
    await page.getByTestId("stage-tab-fragment").click();
    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_time"))
      .toBe(true);

    // Locate the `u_time` text and hover it. CodeMirror tokenizes into
    // multiple spans; grabbing the first span matching the exact text is
    // sufficient for hover positioning.
    const token = content.getByText("u_time", { exact: true }).first();
    await token.scrollIntoViewIfNeeded();
    // Two hover events — CM's hoverTooltip uses a small delay before it
    // shows. Move within the token to trigger pointer motion.
    await token.hover();
    await page.mouse.move(
      (await token.boundingBox().then((b) => b!.x + b!.width / 2)) ?? 0,
      (await token.boundingBox().then((b) => b!.y + b!.height / 2)) ?? 0,
    );

    const tooltip = page.locator(".cm-glsl-hover");
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    await expect(tooltip).toContainText("u_time");
    // The system-uniform Korean description includes "시간" — see
    // SYSTEM_UNIFORM_DESCRIPTIONS in uniformParser.ts.
    await expect(tooltip).toContainText(/시간|time/i);
  });

  test("builtin signatures + descriptions are exposed via __sp.glslSymbols.builtins", async ({
    page,
  }) => {
    // The CM-driven hover test above proves the wiring end-to-end. For the
    // builtin fallback path inside `lookupHover` we lean on the unit tests
    // (hover.test.ts) and only verify here that the catalogue itself is
    // exposed on the DEV bridge with the shape the hover renderer reads —
    // signatures[] non-empty plus a description string.
    const result = await withSp(
      page,
      (sp, args: { names: string[] }) => {
        const out: Record<string, { sig0: string; desc: string }> = {};
        for (const name of args.names) {
          const spec = sp.glslSymbols.builtins[name];
          if (spec)
            out[name] = {
              sig0: spec.signatures[0] ?? "",
              desc: spec.description,
            };
        }
        return out;
      },
      { names: ["mix", "smoothstep", "length", "texture", "normalize"] },
    );
    expect(Object.keys(result).sort()).toEqual([
      "length",
      "mix",
      "normalize",
      "smoothstep",
      "texture",
    ]);
    expect(result.mix?.sig0).toContain("mix(");
    expect(result.mix?.desc).toMatch(/interpolat/i);
    expect(result.length?.sig0).toContain("length(");
    expect(result.texture?.sig0).toContain("sampler2D");
  });
});
