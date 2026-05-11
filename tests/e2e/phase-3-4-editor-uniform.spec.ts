import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import {
  bootApp,
  setGraph,
  trivialMeshGraph,
  trivialShaderSources,
} from "./helpers/fixtures";
import { readSp, waitForRev, withSp } from "./helpers/sp";

test.describe("Phase 3-4 — editor & uniform exposure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: -240, y: 0 },
      s1: { x: 80, y: 0 },
      o1: { x: 400, y: 0 },
    });
  });

  test("edit fragment source → recompile → no errors", async ({ page }) => {
    const canvas = page.getByTestId("viewport-canvas");
    await expectCanvasRendered(canvas);

    const before = await readSp(page, (sp) => sp.graph.getState().rev);

    // Rewrite the fragment source via the store (Edit tool path simulated).
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().updateShaderSource(args.id, {
          fragmentSource: args.src,
        });
      },
      {
        id: "s1",
        src: `${trivialShaderSources.fragment.replace(
          "vec4(u_baseColor, 1.0)",
          "vec4(1.0 - u_baseColor, 1.0)",
        )}`,
      },
    );

    await waitForRev(page, before);

    const diagCount = await readSp(page, (sp) => {
      const d = sp.diagnostics.getState().byNode.s1;
      return (
        (d?.vertex.length ?? 0) +
        (d?.fragment.length ?? 0) +
        (d?.link.length ?? 0)
      );
    });
    expect(diagCount).toBe(0);
  });

  test("add `uniform float u_test;` → inspector row appears", async ({
    page,
  }) => {
    // Make sure inspector tab is the one shown.
    await page.getByTestId("tab-inspector").click();

    // Select s1 so the inspector binds to it.
    await withSp(
      page,
      (sp) => {
        sp.selection.getState().select("s1");
      },
      undefined,
    );

    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    const newFrag = trivialShaderSources.fragment.replace(
      "uniform vec3 u_baseColor;",
      "uniform vec3 u_baseColor;\nuniform float u_test;",
    );
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().updateShaderSource(args.id, {
          fragmentSource: args.src,
        });
      },
      { id: "s1", src: newFrag },
    );
    await waitForRev(page, before);

    const row = page.locator("[data-uniform-name='u_test']");
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-uniform-control", "slider");
  });

  test("introduce GLSL error → diagnosticsStore populated, stage tab flagged", async ({
    page,
  }) => {
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().updateShaderSource(args.id, {
          fragmentSource: args.src,
        });
      },
      {
        id: "s1",
        // Missing semicolon, undeclared variable.
        src: trivialShaderSources.fragment.replace(
          "fragColor = vec4(u_baseColor, 1.0);",
          "fragColor = vec4(undefined_var__, 1.0)",
        ),
      },
    );
    await waitForRev(page, before);

    await expect
      .poll(() =>
        readSp(page, (sp) => {
          const d = sp.diagnostics.getState().byNode.s1;
          return (
            (d?.vertex.length ?? 0) +
            (d?.fragment.length ?? 0) +
            (d?.link.length ?? 0)
          );
        }),
      )
      .toBeGreaterThan(0);

    // Select node so editor binds + stage tab visible.
    await withSp(
      page,
      (sp) => {
        sp.selection.getState().select("s1");
      },
      undefined,
    );
    const fragTab = page.getByTestId("stage-tab-fragment");
    await expect(fragTab).toBeVisible();
  });
});
