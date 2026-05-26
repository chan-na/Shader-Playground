import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { withSp } from "./helpers/sp";

// Phase 27 — GLSL LSP refactor layer:
//   - findReferences (pure logic, exposed on __sp.glslSymbols)
//   - Go-to-definition (F12 + Cmd/Ctrl+Click) — CM keymap drives a cursor jump
//   - Rename (F2 keymap) — single-transaction rewrite of every reference
//   - Active reference highlight — Decoration set when cursor sits on a symbol
//
// All three end-to-end paths share the same demo shader fragment so the
// classifier behaviour is consistent across tests.

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_strength;
out vec4 outColor;

float square(float x) {
  return x * x;
}

void main() {
  float k = square(u_strength);
  outColor = vec4(k, k, u_strength, 1.0);
}
`;

test.describe("Phase 27 — GLSL refactor (references + goto + rename)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("findReferences reports declaration + every use site for a uniform", async ({
    page,
  }) => {
    const sites = await withSp(
      page,
      (sp, args: { src: string }) =>
        sp.glslSymbols.findReferences(args.src, "u_strength", 4).map((s) => ({
          text: args.src.slice(s.from, s.to),
          line: s.line,
          isDef: s.isDefinition,
        })),
      { src: FRAG },
    );
    expect(sites.map((s) => s.text)).toEqual([
      "u_strength",
      "u_strength",
      "u_strength",
    ]);
    expect(sites[0]?.isDef).toBe(true);
    expect(sites[0]?.line).toBe(4);
    expect(sites.filter((s) => !s.isDef).map((s) => s.line)).toEqual([12, 13]);
  });

  test("references honour scope — local k does not match the global k", async ({
    page,
  }) => {
    const SRC = `uniform float k;
void inner() {
  float k = 2.0;
  outColor = vec4(k, k, 1.0, 1.0);
}
void main() {
  outColor = vec4(k);
}
`;
    const globalLines = await withSp(
      page,
      (sp, args: { src: string }) =>
        sp.glslSymbols.findReferences(args.src, "k", 1).map((s) => s.line),
      { src: SRC },
    );
    const localLines = await withSp(
      page,
      (sp, args: { src: string }) =>
        sp.glslSymbols.findReferences(args.src, "k", 3).map((s) => s.line),
      { src: SRC },
    );
    // Global k: decl line 1 + use on line 7 (inside main).
    expect(globalLines.sort((a, b) => a - b)).toEqual([1, 7]);
    // Local k: decl line 3 + two uses on line 4 (vec4(k, k, 1.0, 1.0)).
    expect(localLines.sort((a, b) => a - b)).toEqual([3, 4, 4]);
  });

  test("F12 jumps the cursor from a use site to the declaration", async ({
    page,
  }) => {
    // Drive the editor: select demo shader node, paste FRAG into fragment src.
    await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      if (!node) throw new Error("no shader node");
      sp.selection.getState().select(node.id);
      sp.graph.getState().updateShaderSource(node.id, { fragmentSource: src });
    }, FRAG);
    await page.getByTestId("stage-tab-fragment").click();

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_strength"))
      .toBe(true);

    // Click on a `u_strength` *use* token inside main() (in
    // `vec4(k, k, u_strength, 1.0)`) so the next F12 has somewhere to jump.
    const useToken = content.getByText("u_strength", { exact: true }).last();
    await useToken.click();

    // Sanity: the click landed somewhere inside the body (line > 4).
    const lineAfterClick = await page.evaluate(
      () => window.__sp?.codeEditor.getCursorLine() ?? null,
    );
    expect(lineAfterClick).not.toBeNull();
    expect(lineAfterClick!).toBeGreaterThan(4);

    // F12 should move the cursor to the declaration on line 4.
    await page.keyboard.press("F12");
    await expect
      .poll(() =>
        page.evaluate(() => window.__sp?.codeEditor.getCursorLine() ?? null),
      )
      .toBe(4);
  });

  test("F2 renames every reference in a single transaction", async ({
    page,
  }) => {
    await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      if (!node) throw new Error("no shader node");
      sp.selection.getState().select(node.id);
      sp.graph.getState().updateShaderSource(node.id, { fragmentSource: src });
    }, FRAG);
    await page.getByTestId("stage-tab-fragment").click();

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_strength"))
      .toBe(true);

    // Place cursor on a `u_strength` use. Then intercept the next prompt and
    // submit "u_amount" as the replacement.
    const useToken = content.getByText("u_strength", { exact: true }).last();
    await useToken.click();
    page.once("dialog", (d) => {
      void d.accept("u_amount");
    });
    await page.keyboard.press("F2");

    // The rename committed an edit, which the editor debounce + graph
    // recompile picks up. Wait for the store source to reflect the new name.
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const sp = window.__sp;
          if (!sp) return false;
          const node = sp.graph
            .getState()
            .nodes.find((n) => n.kind === "shader");
          if (!node) return false;
          // GraphNodeMinimal in the test types is loose; cast at runtime.
          const f = (node as { fragmentSource?: string }).fragmentSource;
          return f?.includes("u_amount") === true && !f.includes("u_strength");
        });
      })
      .toBe(true);

    // The new source should still have three occurrences of the symbol —
    // exactly the count of original `u_strength` sites.
    const occurrences = await page.evaluate(() => {
      const sp = window.__sp;
      if (!sp) return 0;
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      const f = node && (node as { fragmentSource?: string }).fragmentSource;
      return (f?.match(/u_amount/g) ?? []).length;
    });
    expect(occurrences).toBe(3);
  });

  test("active reference highlight paints occurrences when cursor lands on a symbol", async ({
    page,
  }) => {
    await page.evaluate(async (src) => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp not exposed");
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      if (!node) throw new Error("no shader node");
      sp.selection.getState().select(node.id);
      sp.graph.getState().updateShaderSource(node.id, { fragmentSource: src });
    }, FRAG);
    await page.getByTestId("stage-tab-fragment").click();

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_strength"))
      .toBe(true);

    // Click on a use site so the cursor lands on `u_strength`.
    const useToken = content.getByText("u_strength", { exact: true }).last();
    await useToken.click();

    // The decoration layer paints one `.cm-glsl-ref-definition` (at the decl)
    // plus one or more `.cm-glsl-ref-occurrence` for each use. Visibility
    // depends on the active editor surface, so we just assert presence.
    await expect(
      content.locator(".cm-glsl-ref-definition").first(),
    ).toBeVisible({ timeout: 3_000 });
    const occurrenceCount = await content
      .locator(".cm-glsl-ref-occurrence")
      .count();
    expect(occurrenceCount).toBeGreaterThan(0);
  });
});
