import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
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
    await page.evaluate(
      async ({ v, f }) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
        if (!node) throw new Error("no shader node");
        sp.selection.getState().select(node.id);
        sp.graph
          .getState()
          .updateShaderSource(node.id, { vertexSource: v, fragmentSource: f });
      },
      { v: VERT, f: FRAG },
    );
    await page.getByTestId("stage-tab-fragment").click();

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_amount"))
      .toBe(true);

    // Click on the fragment-side `u_amount` use inside main(), then F2.
    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    page.once("dialog", (d) => {
      void d.accept("u_strength");
    });
    await page.keyboard.press("F2");

    // Both stages should now hold the renamed identifier — and ZERO copies
    // of the old name remain.
    await expect
      .poll(async () => {
        return await readSp(page, (sp) => {
          const node = sp.graph
            .getState()
            .nodes.find((n) => n.kind === "shader");
          if (!node) return null;
          const n = node as {
            vertexSource?: string;
            fragmentSource?: string;
          };
          return {
            vHas: n.vertexSource?.includes("u_strength") ?? false,
            fHas: n.fragmentSource?.includes("u_strength") ?? false,
            vOld: n.vertexSource?.includes("u_amount") ?? true,
            fOld: n.fragmentSource?.includes("u_amount") ?? true,
            vCount: (n.vertexSource?.match(/u_strength/g) ?? []).length,
            fCount: (n.fragmentSource?.match(/u_strength/g) ?? []).length,
          };
        });
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
    await page.evaluate(
      async ({ v, f }) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
        if (!node) throw new Error("no shader node");
        sp.selection.getState().select(node.id);
        sp.graph
          .getState()
          .updateShaderSource(node.id, { vertexSource: v, fragmentSource: f });
      },
      { v: VERT, f: FRAG },
    );
    await page.getByTestId("stage-tab-vertex").click();

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_amount"))
      .toBe(true);

    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    page.once("dialog", (d) => {
      void d.accept("u_k");
    });
    await page.keyboard.press("F2");

    await expect
      .poll(async () => {
        return await readSp(page, (sp) => {
          const node = sp.graph
            .getState()
            .nodes.find((n) => n.kind === "shader");
          const n = (node ?? {}) as {
            vertexSource?: string;
            fragmentSource?: string;
          };
          return {
            vOld: n.vertexSource?.includes("u_amount") ?? true,
            fOld: n.fragmentSource?.includes("u_amount") ?? true,
            vNew: (n.vertexSource?.match(/u_k\b/g) ?? []).length,
            fNew: (n.fragmentSource?.match(/u_k\b/g) ?? []).length,
          };
        });
      })
      .toEqual({ vOld: false, fOld: false, vNew: 2, fNew: 2 });
  });

  test("renaming a vertex-only attribute does NOT touch fragment", async ({
    page,
  }) => {
    await page.evaluate(
      async ({ v, f }) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
        if (!node) throw new Error("no shader node");
        sp.selection.getState().select(node.id);
        sp.graph
          .getState()
          .updateShaderSource(node.id, { vertexSource: v, fragmentSource: f });
      },
      { v: VERT, f: FRAG },
    );
    await page.getByTestId("stage-tab-vertex").click();
    const fragBefore = await readSp(page, (sp) => {
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      return (node as { fragmentSource?: string } | undefined)?.fragmentSource;
    });

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("a_position"))
      .toBe(true);
    const useToken = content.getByText("a_position", { exact: true }).last();
    await useToken.click();
    page.once("dialog", (d) => {
      void d.accept("a_pos");
    });
    await page.keyboard.press("F2");

    // Vertex got rewritten; fragment is unchanged byte-for-byte.
    await expect
      .poll(async () =>
        withSp(
          page,
          (sp, args: { fragBefore: string | undefined }) => {
            const node = sp.graph
              .getState()
              .nodes.find((n) => n.kind === "shader");
            const n = (node ?? {}) as {
              vertexSource?: string;
              fragmentSource?: string;
            };
            return {
              vRenamed: n.vertexSource?.includes("a_pos") ?? false,
              vOld: n.vertexSource?.includes("a_position") ?? true,
              fragUnchanged: n.fragmentSource === args.fragBefore,
            };
          },
          { fragBefore },
        ),
      )
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
    await page.evaluate(
      async ({ v, f }) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
        if (!node) throw new Error("no shader node");
        sp.selection.getState().select(node.id);
        sp.graph
          .getState()
          .updateShaderSource(node.id, { vertexSource: v, fragmentSource: f });
      },
      { v: V, f: F },
    );
    await page.getByTestId("stage-tab-vertex").click();

    const fragBefore = await readSp(page, (sp) => {
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      return (node as { fragmentSource?: string } | undefined)?.fragmentSource;
    });

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("vec2 pocket"))
      .toBe(true);

    // Click on the vertex local `pocket` — the unique multi-letter name
    // resolves to a CM token element directly.
    const useToken = content.getByText("pocket", { exact: true }).last();
    await useToken.click();
    page.once("dialog", (d) => {
      void d.accept("amt");
    });
    await page.keyboard.press("F2");

    // Vertex got rewritten; fragment's `pocket` is a DIFFERENT local binding
    // and must stay byte-identical.
    await expect
      .poll(async () =>
        withSp(
          page,
          (sp, args: { fragBefore: string | undefined }) => {
            const node = sp.graph
              .getState()
              .nodes.find((n) => n.kind === "shader");
            const n = (node ?? {}) as {
              vertexSource?: string;
              fragmentSource?: string;
            };
            return {
              vRenamed: n.vertexSource?.includes("vec2 amt =") ?? false,
              vOldGone: !(n.vertexSource?.includes("pocket") ?? true),
              fragUnchanged: n.fragmentSource === args.fragBefore,
            };
          },
          { fragBefore },
        ),
      )
      .toEqual({ vRenamed: true, vOldGone: true, fragUnchanged: true });
  });

  test("single graph-history entry for a cross-stage rename", async ({
    page,
  }) => {
    await page.evaluate(
      async ({ v, f }) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
        if (!node) throw new Error("no shader node");
        sp.selection.getState().select(node.id);
        sp.graph
          .getState()
          .updateShaderSource(node.id, { vertexSource: v, fragmentSource: f });
      },
      { v: VERT, f: FRAG },
    );
    await page.getByTestId("stage-tab-fragment").click();
    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_amount"))
      .toBe(true);

    const before = await readSp(
      page,
      (sp) => sp.history.getState().past.length,
    );

    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    page.once("dialog", (d) => {
      void d.accept("u_strength");
    });
    await page.keyboard.press("F2");

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
    const shaderId = await page.evaluate(
      async ({ v, f }) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
        if (!node) throw new Error("no shader node");
        sp.selection.getState().select(node.id);
        sp.graph
          .getState()
          .updateShaderSource(node.id, { vertexSource: v, fragmentSource: f });
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
          target: node.id,
          targetHandle: "u_amount",
        });
        sp.graph.getState().setUniformValue(node.id, "u_amount", 0.5);
        return node.id;
      },
      { v: VERT, f: FRAG },
    );
    await page.getByTestId("stage-tab-fragment").click();
    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_amount"))
      .toBe(true);

    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    page.once("dialog", (d) => {
      void d.accept("u_strength");
    });
    await page.keyboard.press("F2");

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
    await page.evaluate(
      async ({ v, f }) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
        if (!node) throw new Error("no shader node");
        sp.selection.getState().select(node.id);
        sp.graph
          .getState()
          .updateShaderSource(node.id, { vertexSource: v, fragmentSource: f });
      },
      { v: VERT, f: FRAG },
    );
    await page.getByTestId("stage-tab-fragment").click();

    const content = page.locator(".cm-content").first();
    await expect
      .poll(async () => (await content.textContent())?.includes("u_amount"))
      .toBe(true);

    // Click the fragment-side use of u_amount inside main() — the cursor lands
    // well past offset 0 (line 1).
    const useToken = content.getByText("u_amount", { exact: true }).last();
    await useToken.click();
    const cursorBefore = await readSp(page, (sp) =>
      sp.codeEditor.getCursorLine(),
    );
    expect(cursorBefore ?? 0).toBeGreaterThan(1);

    page.once("dialog", (d) => {
      void d.accept("u_strength");
    });
    await page.keyboard.press("F2");

    // Wait for the cross-stage rewrite to land in the store.
    await expect
      .poll(async () =>
        readSp(page, (sp) => {
          const node = sp.graph
            .getState()
            .nodes.find((n) => n.kind === "shader");
          const n = (node ?? {}) as { fragmentSource?: string };
          return n.fragmentSource?.includes("u_strength") ?? false;
        }),
      )
      .toBe(true);

    // The rename mutates the doc AND commits to the store in one turn. The
    // reload effect must recognize the editor already shows `source` and skip
    // the full {from:0,to:len} replace — that dispatch carries no selection and
    // would collapse the cursor to offset 0 (line 1). The cursor must stay on
    // its original line. (M11)
    await expect
      .poll(() => readSp(page, (sp) => sp.codeEditor.getCursorLine()))
      .toBe(cursorBefore);
  });
});
