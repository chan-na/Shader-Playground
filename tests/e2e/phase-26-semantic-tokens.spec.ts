import { expect, test } from "@playwright/test";
import { openStageEditor, seedShaderAndSelect } from "./helpers/editor";
import { bootApp } from "./helpers/fixtures";

// Phase 26 — Semantic token highlighting, end-to-end through CodeMirror:
// paste a known fragment into the demo shader, wait for the editor to mount
// it, and assert the rendered DOM has `cm-glsl-token-<kind>` spans at the
// expected text. The classifier itself is unit-tested in
// src/core/glsl/semanticTokens.test.ts.

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

  test("CodeMirror renders cm-glsl-token-* spans for highlighted identifiers", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { fragment: FRAG });
    const content = await openStageEditor(page, "fragment", "u_strength");

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
});
