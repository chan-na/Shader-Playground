import { expect, test } from "@playwright/test";
import {
  expectCanvasCellRendered,
  expectCanvasRendered,
  splitCellToImageRect,
} from "./helpers/canvas";
import {
  bootApp,
  setGraph,
  trivialMeshGraph,
  trivialShaderSources,
} from "./helpers/fixtures";
import { readSp, waitForRev, withSp } from "./helpers/sp";

test.describe("Phase 10 — parameters & multi-output", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("Param(color) → shader uniform overrides inspector value", async ({
    page,
  }) => {
    // Build a graph: mesh → shader (with uniform vec3 u_tint) → output,
    // and a Param node feeding u_tint.
    const fragWithTint = trivialShaderSources.fragment
      .replace(
        "uniform vec3 u_baseColor;",
        "uniform vec3 u_baseColor;\nuniform vec3 u_tint;",
      )
      .replace(
        "fragColor = vec4(u_baseColor, 1.0);",
        "fragColor = vec4(u_baseColor * u_tint, 1.0);",
      );
    await setGraph(
      page,
      {
        nodes: [
          { id: "m1", kind: "mesh", primitive: "sphere" },
          {
            id: "s1",
            kind: "shader",
            vertexSource: trivialShaderSources.vertex,
            fragmentSource: fragWithTint,
            uniformValues: {
              u_baseColor: [1.0, 1.0, 1.0],
              // Intentionally green so we can distinguish from the param.
              u_tint: [0.0, 1.0, 0.0],
            },
          },
          {
            id: "p1",
            kind: "param",
            paramKind: "color",
            value: [1.0, 0.2, 0.2],
          },
          { id: "o1", kind: "output" },
        ],
        edges: [
          {
            id: "em",
            source: "m1",
            sourceHandle: "mesh",
            target: "s1",
            targetHandle: "mesh",
          },
          {
            id: "et",
            source: "p1",
            sourceHandle: "value",
            target: "s1",
            targetHandle: "u_tint",
          },
          {
            id: "eo",
            source: "s1",
            sourceHandle: "texture",
            target: "o1",
            targetHandle: "texture",
          },
        ],
      },
      {},
    );

    const canvas = page.getByTestId("viewport-canvas");
    const stats = await expectCanvasRendered(canvas, { ratio: 0.1 });
    // u_tint was set to [1, 0.2, 0.2] (red-leaning) on the param; if the
    // override worked, red should dominate over green/blue across the sphere.
    expect(stats.avg.r).toBeGreaterThan(stats.avg.g);
    expect(stats.avg.r).toBeGreaterThan(stats.avg.b);
  });

  test("3 Output nodes → split layout with 3 cells (top-row 2 + bottom 1)", async ({
    page,
  }) => {
    // Chain demo gives us 3 chained shaders, then we wire each to its own
    // Output.
    await setGraph(
      page,
      {
        nodes: [
          {
            id: "s1",
            kind: "shader",
            vertexSource: trivialShaderSources.vertex,
            fragmentSource: trivialShaderSources.fragment,
            uniformValues: { u_baseColor: [1.0, 0.2, 0.2] },
          },
          {
            id: "s2",
            kind: "shader",
            vertexSource: trivialShaderSources.vertex,
            fragmentSource: trivialShaderSources.fragment,
            uniformValues: { u_baseColor: [0.2, 1.0, 0.2] },
          },
          {
            id: "s3",
            kind: "shader",
            vertexSource: trivialShaderSources.vertex,
            fragmentSource: trivialShaderSources.fragment,
            uniformValues: { u_baseColor: [0.2, 0.2, 1.0] },
          },
          { id: "m1", kind: "mesh", primitive: "sphere" },
          { id: "o1", kind: "output" },
          { id: "o2", kind: "output" },
          { id: "o3", kind: "output" },
        ],
        edges: [
          {
            id: "m1s1",
            source: "m1",
            sourceHandle: "mesh",
            target: "s1",
            targetHandle: "mesh",
          },
          {
            id: "m1s2",
            source: "m1",
            sourceHandle: "mesh",
            target: "s2",
            targetHandle: "mesh",
          },
          {
            id: "m1s3",
            source: "m1",
            sourceHandle: "mesh",
            target: "s3",
            targetHandle: "mesh",
          },
          {
            id: "eo1",
            source: "s1",
            sourceHandle: "texture",
            target: "o1",
            targetHandle: "texture",
          },
          {
            id: "eo2",
            source: "s2",
            sourceHandle: "texture",
            target: "o2",
            targetHandle: "texture",
          },
          {
            id: "eo3",
            source: "s3",
            sourceHandle: "texture",
            target: "o3",
            targetHandle: "texture",
          },
        ],
      },
      {},
    );

    const canvas = page.getByTestId("viewport-canvas");
    // Coarse whole-canvas smoke check first (cheap, just "did anything
    // render yet") — the real regression guard is the per-cell sampling
    // below, so this doesn't need to be strict.
    await expectCanvasRendered(canvas, { ratio: 0.05 });

    // Sample each split-view cell independently instead of a single global
    // ratio. The App Shell's 48px AppToolbar (M1-U3) shrank the viewport's
    // available height, which lowers a whole-canvas ratio for every 3-way
    // split render — a global ratio only weakly signals a regression, since
    // dropping one cell entirely out of 3 just nudges the aggregate down
    // instead of clearly failing. Sampling each cell on its own catches that
    // cell going blank directly: measured 0.15625 per cell with all 3
    // rendering (deterministic across runs — a static sphere silhouette, not
    // a timing-sensitive frame), vs. ~0 for a cell that fails to draw, so a
    // 0.10 per-cell threshold (same order as the single-viewport check in
    // Phase 1-2) keeps a wide, stable margin on both sides. We use the
    // canvas's real backing-store resolution (not a fixture size) so cell
    // geometry matches what's actually on screen.
    const { height, cells } = await page.evaluate(async () => {
      // @ts-expect-error - dev-mode dynamic path
      const mod = await import("/src/core/graph/execute.ts");
      const cv = document.querySelector(
        '[data-testid="viewport-canvas"]',
      ) as HTMLCanvasElement;
      const w = cv.width;
      const h = cv.height;
      const splitLayout = mod.splitLayout as (
        n: number,
        width: number,
        height: number,
      ) => Array<{ x: number; y: number; w: number; h: number }>;
      return { height: h, cells: splitLayout(3, w, h) };
    });
    expect(cells).toHaveLength(3);

    for (const cell of cells) {
      const rect = splitCellToImageRect(cell, height);
      const stats = await expectCanvasCellRendered(canvas, rect, {
        ratio: 0.1,
      });
      // Each cell shows one of the 3 differently-colored spheres — a
      // tightly-cropped per-cell sample should still show real color
      // variation, not just a stray pixel.
      expect(stats.spread).toBeGreaterThan(20);
    }
  });

  test("Adding a 5th Output is rejected by validateGraph", async ({ page }) => {
    await setGraph(page, trivialMeshGraph(), {});
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    // Add 4 more Output nodes (graph already has o1 → so 5 total).
    await withSp(
      page,
      (sp) => {
        const g = sp.graph.getState();
        g.addNode({ id: "ox2", kind: "output" });
        g.addNode({ id: "ox3", kind: "output" });
        g.addNode({ id: "ox4", kind: "output" });
        g.addNode({ id: "ox5", kind: "output" });
      },
      undefined,
    );
    await waitForRev(page, before);

    // Compile error should surface in rendererStore. Easier: invoke validate
    // directly via dynamic import.
    const errors = await page.evaluate(async () => {
      // @ts-expect-error - dev-mode path
      const mod = await import("/src/core/graph/validate.ts");
      const sp = window.__sp;
      if (!sp) return [];
      const g = sp.graph.getState();
      return (mod.validateGraph as (g: unknown) => Array<{ code: string }>)({
        nodes: g.nodes,
        edges: g.edges,
      });
    });
    expect(errors.some((e) => e.code === "multiple_outputs")).toBe(true);
  });
});
