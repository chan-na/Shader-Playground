import { expect, test } from "@playwright/test";
import { boxOf } from "./helpers/dom";
import { openStageEditor, seedShaderAndSelect } from "./helpers/editor";
import { bootApp } from "./helpers/fixtures";

// Phase 25 — LSP-like editor features layered onto CodeMirror 6: a
// scope-aware symbol table (unit-tested in src/core/glsl/symbolTable.test.ts
// and symbolScope.test.ts) and a hover tooltip that reads symbols, builtin signatures and system
// uniforms. The hover wiring is exercised by loading a fragment into the
// editor and asserting the CodeMirror tooltip DOM appears with the right
// content. The builtin catalogue (signatures, descriptions) is covered by
// src/core/glsl/builtins.test.ts and hover.test.ts.

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

  test("hovering over a uniform shows the system-uniform description", async ({
    page,
  }) => {
    // Drive the editor: select the demo shader node, paste a known fragment,
    // wait for the editor to load it, then hover the `u_time` token in
    // CodeMirror's content area.
    await seedShaderAndSelect(page, { fragment: FRAG_WITH_HELPER });
    const content = await openStageEditor(page, "fragment", "u_time");

    // Locate the `u_time` text and hover it. CodeMirror tokenizes into
    // multiple spans; grabbing the first span matching the exact text is
    // sufficient for hover positioning.
    const token = content.getByText("u_time", { exact: true }).first();
    await token.scrollIntoViewIfNeeded();
    // Two hover events — CM's hoverTooltip uses a small delay before it
    // shows. Move within the token to trigger pointer motion.
    await token.hover();
    const tokenBox = await boxOf(token);
    await page.mouse.move(tokenBox.cx, tokenBox.cy);

    const tooltip = page.locator(".cm-glsl-hover");
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    await expect(tooltip).toContainText("u_time");
    // The system-uniform Korean description includes "시간" — see
    // SYSTEM_UNIFORM_DESCRIPTIONS in uniformParser.ts.
    await expect(tooltip).toContainText(/시간|time/i);
  });
});
