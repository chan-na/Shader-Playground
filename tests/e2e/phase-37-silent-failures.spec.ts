import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

/**
 * Phase 37 — silent-failure diagnostics (E-1, B-2,
 * `docs/learnability-plan-2026-08.md` T2). Every warning asserted here is a
 * pre-existing "quiet skip" in the GL layer (`core/gl/uniforms.ts`'s
 * `loc === null` early-return, `core/gl/mesh.ts`'s `loc === undefined || loc
 * < 0` skip) made visible through `passPlanStore`. Covers E-1 (sampler-
 * unconnected + uniform-inactive, ProblemsPanel warning rows) and B-2 (mesh
 * attribute consumption, node card + Inspector).
 */

const BASIC_VERT = `#version 300 es
in vec3 a_position;
void main() {
  gl_Position = vec4(a_position, 1.0);
}`;

const SAMPLER_UNCONNECTED_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
out vec4 fragColor;
void main() {
  fragColor = texture(u_tex, vec2(0.5));
}`;

const SAMPLER_UNCONNECTED_FRAG_WITH_GHOST = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_ghost;
out vec4 fragColor;
void main() {
  fragColor = texture(u_tex, vec2(0.5));
}`;

const SOLID_COLOR_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}`;

function samplerUnconnectedGraph() {
  return {
    nodes: [
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource: BASIC_VERT,
        fragmentSource: SAMPLER_UNCONNECTED_FRAG,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "e1",
        source: "s1",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

test.describe("Phase 37 — silent failure diagnostics", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("E-1: sampler-unconnected warns, resolves once wired, and its row selects the node", async ({
    page,
  }) => {
    await setGraph(page, samplerUnconnectedGraph(), {});

    const statusProblems = page.getByTestId("status-problems");
    await expect(statusProblems).toHaveText(/1 problem/);

    await statusProblems.click();
    const samplerRow = page.locator(
      '[data-testid="silent-warning-row"][data-kind="sampler-unconnected"][data-uniform-name="u_tex"]',
    );
    await expect(samplerRow).toBeVisible();
    await expect(
      page.locator(".problems-chip", { hasText: "1 warning" }),
    ).toBeVisible();

    // Clicking the row selects the owning node (no line info, so no jump).
    await samplerRow.click();
    await expect
      .poll(() => readSp(page, (sp) => sp.selection.getState().selectedNodeId))
      .toBe("s1");

    // Wire it up: a plain solid-color shader feeding s1's u_tex sampler.
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().addNode({
          id: "s0",
          kind: "shader",
          vertexSource: args.vert,
          fragmentSource: args.frag,
          uniformValues: {},
        });
        sp.graph.getState().addEdge({
          id: "e2",
          source: "s0",
          sourceHandle: "texture",
          target: "s1",
          targetHandle: "u_tex",
        });
      },
      { vert: BASIC_VERT, frag: SOLID_COLOR_FRAG },
    );

    await expect
      .poll(() => page.locator('[data-testid="silent-warning-row"]').count())
      .toBe(0);
    await expect(statusProblems).toHaveText("no problems");

    // Now declare an unused uniform — the linker drops it, and that's
    // reported as uniform-inactive with non-assertive wording (not tested
    // here, see silentUniforms.test.ts — only the row's presence/content).
    await withSp(
      page,
      (sp, args) => {
        sp.graph
          .getState()
          .updateShaderSource("s1", { fragmentSource: args.frag });
      },
      { frag: SAMPLER_UNCONNECTED_FRAG_WITH_GHOST },
    );

    const ghostRow = page.locator(
      '[data-testid="silent-warning-row"][data-kind="uniform-inactive"]',
    );
    await expect(ghostRow).toBeVisible();
    await expect(ghostRow).toContainText("u_ghost");
  });

  test("B-2: mesh attribute skip warnings track the connected consumer's actual bindings", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {});

    // TRIVIAL_VERT (helpers/fixtures.ts) declares only a_position, so
    // a_normal/a_uv are never even attributes of the linked program —
    // deterministic across drivers (unlike "declared but optimized out").
    const skipped = page.getByTestId("mesh-skipped-attrs");
    await expect(skipped).toBeVisible();
    await expect(skipped).toContainText("a_normal");
    await expect(skipped).toContainText("a_uv");
    await expect(skipped).not.toContainText("a_position");

    await withSp(page, (sp) => sp.selection.getState().select("m1"), undefined);

    const meshAttrs = page.getByTestId("mesh-attributes");
    await expect(meshAttrs).toBeVisible();
    await expect(
      meshAttrs.locator('[data-attr-name="a_position"]'),
    ).toHaveAttribute("data-attr-status", "consumed");
    await expect(meshAttrs.locator('[data-attr-name="a_uv"]')).toHaveAttribute(
      "data-attr-status",
      "skipped",
    );

    // Remove the mesh→shader edge: m1 now has no consumer at all, so the
    // aggregation must fall back to "unknown" (not "skipped") and the
    // node-card warning line must disappear.
    await withSp(page, (sp) => sp.graph.getState().removeEdge("e1"), undefined);

    await expect
      .poll(() => page.getByTestId("mesh-skipped-attrs").count())
      .toBe(0);
  });
});
