import { expect, test } from "@playwright/test";
import {
  openStageEditor,
  renameViaF2,
  seedShaderAndSelect,
  shaderSources,
} from "./helpers/editor";
import { bootApp } from "./helpers/fixtures";
import { expectNoRendererErrors } from "./helpers/render";
import { readSp, withSp } from "./helpers/sp";

// Phase 28 — Cross-stage rename for ShaderNode.
//   - A ShaderNode holds vertex + fragment sources under one logical program.
//   - When the user F2-renames a uniform / varying / function / struct /
//     top-level const that's declared in both stages, the rewrite must hit
//     occurrences in BOTH stages in a single graph-history entry.
//   - Locals, parameters, and per-stage-only globals (e.g. a vertex `in`
//     attribute that doesn't exist in fragment) must NOT cross stages.

const VERT = `#version 300 es
in vec3 a_position;
uniform float u_amount;
out vec2 v_uv;

void main() {
  v_uv = a_position.xy * u_amount;
  gl_Position = vec4(a_position, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_amount;
out vec4 outColor;

void main() {
  outColor = vec4(v_uv * u_amount, 0.0, 1.0);
}
`;

test.describe("Phase 28 — cross-stage rename", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("renaming a uniform from the fragment side updates BOTH stages", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { vertex: VERT, fragment: FRAG });
    const content = await openStageEditor(page, "fragment", "u_amount");

    // Click on the fragment-side `u_amount` use inside main(), then F2.
    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    await renameViaF2(page, "u_strength");

    // Both stages should now hold the renamed identifier — and ZERO copies
    // of the old name remain.
    await expect
      .poll(async () => {
        const { vertex, fragment } = await shaderSources(page);
        return {
          vHas: vertex.includes("u_strength"),
          fHas: fragment.includes("u_strength"),
          vOld: vertex.includes("u_amount"),
          fOld: fragment.includes("u_amount"),
          vCount: (vertex.match(/u_strength/g) ?? []).length,
          fCount: (fragment.match(/u_strength/g) ?? []).length,
        };
      })
      .toEqual({
        vHas: true,
        fHas: true,
        vOld: false,
        fOld: false,
        // VERT: 1 decl + 1 use; FRAG: 1 decl + 1 use.
        vCount: 2,
        fCount: 2,
      });
  });

  test("renaming a uniform from the vertex side updates BOTH stages", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { vertex: VERT, fragment: FRAG });
    const content = await openStageEditor(page, "vertex", "u_amount");

    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    await renameViaF2(page, "u_k");

    await expect
      .poll(async () => {
        const { vertex, fragment } = await shaderSources(page);
        return {
          vOld: vertex.includes("u_amount"),
          fOld: fragment.includes("u_amount"),
          vNew: (vertex.match(/u_k\b/g) ?? []).length,
          fNew: (fragment.match(/u_k\b/g) ?? []).length,
        };
      })
      .toEqual({ vOld: false, fOld: false, vNew: 2, fNew: 2 });
  });

  test("renaming a vertex-only attribute does NOT touch fragment", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { vertex: VERT, fragment: FRAG });
    const fragBefore = (await shaderSources(page)).fragment;
    const content = await openStageEditor(page, "vertex", "a_position");
    const useToken = content.getByText("a_position", { exact: true }).last();
    await useToken.click();
    await renameViaF2(page, "a_pos");

    // Vertex got rewritten; fragment is unchanged byte-for-byte.
    await expect
      .poll(async () => {
        const { vertex, fragment } = await shaderSources(page);
        return {
          vRenamed: vertex.includes("a_pos"),
          vOld: vertex.includes("a_position"),
          fragUnchanged: fragment === fragBefore,
        };
      })
      .toEqual({ vRenamed: true, vOld: false, fragUnchanged: true });
  });

  test("renaming a local does NOT cross stages even when both stages name it the same", async ({
    page,
  }) => {
    // Both stages declare a local named `pocket` — but as DIFFERENT bindings
    // (each function body has its own). Renaming the vertex one must not
    // touch the fragment one. We use a distinctive multi-letter name so the
    // CodeMirror getByText locator can address it precisely.
    const V = `#version 300 es
in vec3 a_position;
out vec2 v_uv;
void main() {
  vec2 pocket = a_position.xy * 0.5;
  v_uv = pocket;
  gl_Position = vec4(a_position, 1.0);
}
`;
    const F = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec4 pocket = vec4(v_uv, 0.0, 1.0);
  outColor = pocket;
}
`;
    await seedShaderAndSelect(page, { vertex: V, fragment: F });
    const fragBefore = (await shaderSources(page)).fragment;
    const content = await openStageEditor(page, "vertex", "vec2 pocket");

    // Click on the vertex local `pocket` — the unique multi-letter name
    // resolves to a CM token element directly.
    const useToken = content.getByText("pocket", { exact: true }).last();
    await useToken.click();
    await renameViaF2(page, "amt");

    // Vertex got rewritten; fragment's `pocket` is a DIFFERENT local binding
    // and must stay byte-identical.
    await expect
      .poll(async () => {
        const { vertex, fragment } = await shaderSources(page);
        return {
          vRenamed: vertex.includes("vec2 amt ="),
          vOldGone: !vertex.includes("pocket"),
          fragUnchanged: fragment === fragBefore,
        };
      })
      .toEqual({ vRenamed: true, vOldGone: true, fragUnchanged: true });
  });

  test("single graph-history entry for a cross-stage rename", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { vertex: VERT, fragment: FRAG });
    const content = await openStageEditor(page, "fragment", "u_amount");

    const before = await readSp(
      page,
      (sp) => sp.history.getState().past.length,
    );

    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    await renameViaF2(page, "u_strength");

    // The cross-stage commit happens through ONE updateShaderSource patch =
    // one history push. (The CM dispatch's debounced commit a moment later
    // sees the store already matches and bails out.)
    await expect
      .poll(async () => readSp(page, (sp) => sp.history.getState().past.length))
      .toBe(before + 1);
  });

  test("cross-stage rename carries the uniform's edge and tuned value", async ({
    page,
  }) => {
    // The rename refactor passes the exact old→new pair with the both-stages
    // patch, so the store moves the input port's edge instead of reading the
    // old name as a deleted uniform.
    const shaderId = await seedShaderAndSelect(page, {
      vertex: VERT,
      fragment: FRAG,
    });
    await withSp(
      page,
      (sp, id: string) => {
        sp.graph.getState().addNode({
          id: "p-xstage",
          kind: "param",
          paramKind: "float",
          value: 0.25,
        });
        sp.graph.getState().addEdge({
          id: "e-xstage",
          source: "p-xstage",
          sourceHandle: "value",
          target: id,
          targetHandle: "u_amount",
        });
        sp.graph.getState().setUniformValue(id, "u_amount", 0.5);
      },
      shaderId,
    );
    const content = await openStageEditor(page, "fragment", "u_amount");

    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    await renameViaF2(page, "u_strength");

    await expect
      .poll(async () =>
        withSp(
          page,
          (sp, id: string) => {
            const g = sp.graph.getState();
            const node = g.nodes.find((n) => n.id === id) as
              | { uniformValues?: Record<string, number | number[]> }
              | undefined;
            const e = g.edges.find((edge) => edge.id === "e-xstage");
            return {
              handle: e?.targetHandle ?? null,
              value: node?.uniformValues?.u_strength ?? null,
              staleKey: node?.uniformValues
                ? "u_amount" in node.uniformValues
                : true,
            };
          },
          shaderId,
        ),
      )
      .toEqual({ handle: "u_strength", value: 0.5, staleKey: false });
  });

  test("cross-stage rename keeps the cursor in place (no offset-0 collapse)", async ({
    page,
  }) => {
    await seedShaderAndSelect(page, { vertex: VERT, fragment: FRAG });
    const content = await openStageEditor(page, "fragment", "u_amount");

    // Click the fragment-side use of u_amount inside main() — the cursor lands
    // well past offset 0 (line 1).
    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    const cursorBefore = await readSp(page, (sp) =>
      sp.codeEditor.getCursorLine(),
    );
    expect(cursorBefore ?? 0).toBeGreaterThan(1);

    await renameViaF2(page, "u_strength");

    // Wait for the cross-stage rewrite to land in the store.
    await expect
      .poll(async () => (await shaderSources(page)).fragment)
      .toContain("u_strength");

    // The rename mutates the doc AND commits to the store in one turn. The
    // reload effect must recognize the editor already shows `source` and skip
    // the full {from:0,to:len} replace — that dispatch carries no selection and
    // would collapse the cursor to offset 0 (line 1). The cursor must stay on
    // its original line.
    await expect
      .poll(() => readSp(page, (sp) => sp.codeEditor.getCursorLine()))
      .toBe(cursorBefore);
  });

  // CRLF in the paired stage. The reference finder reports absolute
  // document offsets and `rename.ts` slices the OTHER stage's source with them
  // directly (`applyEdits`), but that source comes raw out of graphStore, not
  // out of CodeMirror. The line walk used to drop each line's `\r` while only
  // advancing past the `\n`, so every offset after line 1 drifted by one
  // character per preceding line and the rename rewrote the wrong characters —
  // mangled GLSL, committed to graph history. Unit tests pin the arithmetic and
  // `runRename`; this pins the production wiring that feeds it
  // (`resolveCrossStageContext` reading the store, CodeMirror normalising only
  // the document it holds).
  //
  // `deserializeProject` normalises imported sources to LF, so this spec
  // plants the CRLF through the `__sp` dev hook — `updateShaderSource` still
  // accepts whatever it is given, which is exactly the writer this arithmetic
  // guards.
  test("renaming into a CRLF paired stage rewrites the right offsets", async ({
    page,
  }) => {
    const vertCrlf = VERT.replace(/\n/g, "\r\n");

    await seedShaderAndSelect(page, { vertex: vertCrlf, fragment: FRAG });

    // The store really is holding CRLF — `updateShaderSource` does not
    // normalise, and the fragment-only editor never rewrites the vertex stage.
    expect((await shaderSources(page)).vertex).toContain("\r\n");

    // A CRLF vertex source must still compile, or the rename below would be
    // renaming a shader that never linked.
    await expectNoRendererErrors(page, { eventually: true });

    const content = await openStageEditor(page, "fragment", "u_amount");

    await content.getByText("u_amount", { exact: true }).last().click();
    await renameViaF2(page, "u_strength");

    await expect
      .poll(async () => (await shaderSources(page)).vertex)
      .toContain("u_strength");

    // The vertex stage must be EXACTLY the original with both `u_amount`
    // occurrences swapped: same CRLF terminators, nothing else touched. On the
    // unfixed build the two edits landed one and two characters late, eating
    // parts of `a_position.xy` and `vec4(a_position`.
    const vertexAfter = (await shaderSources(page)).vertex;
    expect(vertexAfter).toBe(vertCrlf.replace(/u_amount/g, "u_strength"));

    // …and the rewritten program still compiles.
    await expectNoRendererErrors(page, { eventually: true });
  });
});
