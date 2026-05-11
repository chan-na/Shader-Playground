import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
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
    const stats = await expectCanvasRendered(canvas, { ratio: 0.15 });
    // 3 outputs of different colors should produce non-trivial spread.
    expect(stats.spread).toBeGreaterThan(40);

    // Verify the split-layout reports 3 cells. We re-import the helper from
    // the running app to assert against the production implementation.
    const cells = await page.evaluate(async () => {
      // @ts-expect-error - dev-mode dynamic path
      const mod = await import("/src/core/graph/execute.ts");
      return (
        mod.splitLayout as (n: number, w: number, h: number) => unknown[]
      )(3, 800, 600);
    });
    expect(cells).toHaveLength(3);
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
