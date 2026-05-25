import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { readSp } from "./helpers/sp";

// Phase 24 — live GLSL validation via OffscreenCanvas WebGL2 worker.
//   - The validator client returns parsed GLSLDiagnostic[] from a real
//     worker compile, off the main thread. We confirm here that the
//     end-to-end pipeline (page → worker → main GL InfoLog → parser)
//     produces the expected line/severity/message for canonical cases.
//   - The CodeEditor wires live diagnostics into the StageTabs error dot
//     (`data-has-error`) so typing a bad fragment shows red even before
//     the structural recompile lands. We exercise that via a real
//     keystroke into CodeMirror.

const FRAG_CLEAN = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, 0.0, 1.0);
}`;

const FRAG_BAD = `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(undefined_thing, 0.0, 0.0, 1.0);
}`;

test.describe("Phase 24 — live GLSL validation (OffscreenCanvas worker)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("validator returns parsed diagnostics for a fragment with an undeclared identifier", async ({
    page,
  }) => {
    // Direct API call — proves the worker pipeline end-to-end:
    //   client → ?worker bundle → OffscreenCanvas WebGL2 compile →
    //   InfoLog → parseShaderInfoLog → GLSLDiagnostic[].
    const diags = await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      return await sp.glslValidator().validate("fragment", src);
    }, FRAG_BAD);

    expect(diags.length).toBeGreaterThan(0);
    const first = diags[0];
    expect(first?.severity).toBe("error");
    expect(first?.line).toBe(5);
    expect(first?.message).toContain("undefined_thing");
  });

  test("validator returns an empty array for a clean fragment", async ({
    page,
  }) => {
    const diags = await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      return await sp.glslValidator().validate("fragment", src);
    }, FRAG_CLEAN);
    expect(diags).toEqual([]);
  });

  test("typing a syntax error in the editor turns on the fragment tab error dot", async ({
    page,
  }) => {
    // Seed the demo shader node with a clean fragment so we start green.
    await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      const s = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      if (!s) throw new Error("no shader node in demo");
      sp.selection.getState().select(s.id);
      sp.graph.getState().updateShaderSource(s.id, { fragmentSource: src });
    }, FRAG_CLEAN);

    // Fragment tab starts green.
    await page.getByTestId("stage-tab-fragment").click();
    await expect
      .poll(async () =>
        page.getByTestId("stage-tab-fragment").getAttribute("data-has-error"),
      )
      .toBe("false");

    // Type a stray identifier into the editor — this should fire the live
    // validator (debounced 150ms inside CodeEditor) and turn the dot red
    // either via the live path or, soon after, the authoritative recompile.
    // Either path proves the wiring; what we are guarding against is "no
    // error signal at all reaches the tab".
    const content = page.locator(".cm-content").first();
    await content.click();
    await page.keyboard.press("End"); // move cursor to end of current line
    await page.keyboard.type("\nbad_token_xyz", { delay: 5 });

    await expect
      .poll(
        async () =>
          page.getByTestId("stage-tab-fragment").getAttribute("data-has-error"),
        { timeout: 5_000 },
      )
      .toBe("true");
  });

  test("the validator is shared across nodes (singleton)", async ({ page }) => {
    const sameInstance = await readSp(page, (sp) => {
      const a = sp.glslValidator();
      const b = sp.glslValidator();
      return a === b;
    });
    expect(sameInstance).toBe(true);
  });
});
