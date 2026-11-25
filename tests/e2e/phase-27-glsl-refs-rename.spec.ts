import { expect, test } from "@playwright/test";
import {
  openStageEditor,
  renameViaF2,
  seedShaderAndSelect,
  shaderSources,
} from "./helpers/editor";
import { bootApp } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Phase 27 — GLSL LSP refactor layer, end-to-end through CodeMirror:
//   - Go-to-definition (F12 + Cmd/Ctrl+Click) — CM keymap drives a cursor jump
//   - Rename (F2 keymap) — single-transaction rewrite of every reference
//   - Active reference highlight — Decoration set when cursor sits on a symbol
// `findReferences` itself (scope, shadowing) is unit-tested in
// src/core/glsl/references.test.ts. Every path shares the same fragment so
// the classifier behaviour is consistent across tests.

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

  test("F12 jumps the cursor from a use site to the declaration", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { fragment: FRAG });
    const content = await openStageEditor(page, "fragment", "u_strength");

    // Click on a `u_strength` *use* token inside main() (in
    // `vec4(k, k, u_strength, 1.0)`) so the next F12 has somewhere to jump.
    const useToken = content.getByText("u_strength", { exact: true }).last();
    await useToken.click();

    // Sanity: the click landed somewhere inside the body (line > 4).
    const lineAfterClick = await readSp(page, (sp) =>
      sp.codeEditor.getCursorLine(),
    );
    expect(lineAfterClick ?? 0).toBeGreaterThan(4);

    // F12 should move the cursor to the declaration on line 4.
    await page.keyboard.press("F12");
    await expect
      .poll(() => readSp(page, (sp) => sp.codeEditor.getCursorLine()))
      .toBe(4);
  });

  test("F2 renames every reference in a single transaction", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { fragment: FRAG });
    const content = await openStageEditor(page, "fragment", "u_strength");

    // Place cursor on a `u_strength` use, then rename it to "u_amount".
    await content.getByText("u_strength", { exact: true }).last().click();
    await renameViaF2(page, "u_amount");

    // The rename committed an edit, which the editor debounce + graph
    // recompile picks up. Wait for the store source to reflect the new name.
    await expect
      .poll(async () => {
        const f = (await shaderSources(page)).fragment;
        return f.includes("u_amount") && !f.includes("u_strength");
      })
      .toBe(true);

    // The new source should still have three occurrences of the symbol —
    // exactly the count of original `u_strength` sites.
    const f = (await shaderSources(page)).fragment;
    expect((f.match(/u_amount/g) ?? []).length).toBe(3);
  });

  test("F2 rename carries the uniform's edge and tuned value to the new name", async ({
    page,
  }) => {
    // A uniform is also a node input port, so a rename retires one port and
    // creates another. Without reconciliation the wiring silently disappears.
    const shaderId = await seedShaderAndSelect(page, { fragment: FRAG });
    await withSp(
      page,
      (sp, id: string) => {
        sp.graph.getState().addNode({
          id: "p-rename",
          kind: "param",
          paramKind: "float",
          value: 0.25,
        });
        sp.graph.getState().addEdge({
          id: "e-rename",
          source: "p-rename",
          sourceHandle: "value",
          target: id,
          targetHandle: "u_strength",
        });
        sp.graph.getState().setUniformValue(id, "u_strength", 0.75);
      },
      shaderId,
    );
    const content = await openStageEditor(page, "fragment", "u_strength");

    await content.getByText("u_strength", { exact: true }).last().click();
    await renameViaF2(page, "u_amount");

    // The edge follows the port to its new name, and the Inspector value
    // follows with it instead of resetting to the declaration default.
    await expect
      .poll(async () =>
        withSp(
          page,
          (sp, id: string) => {
            const g = sp.graph.getState();
            const node = g.nodes.find((n) => n.id === id) as
              | { uniformValues?: Record<string, number | number[]> }
              | undefined;
            const e = g.edges.find((edge) => edge.id === "e-rename");
            return {
              handle: e?.targetHandle ?? null,
              value: node?.uniformValues?.u_amount ?? null,
              staleKey: node?.uniformValues
                ? "u_strength" in node.uniformValues
                : true,
            };
          },
          shaderId,
        ),
      )
      .toEqual({ handle: "u_amount", value: 0.75, staleKey: false });
  });

  test("active reference highlight paints occurrences when cursor lands on a symbol", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { fragment: FRAG });
    const content = await openStageEditor(page, "fragment", "u_strength");

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
