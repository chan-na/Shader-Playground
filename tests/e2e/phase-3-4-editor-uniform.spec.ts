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

  test("Inspector uniform search filters rows by name/type", async ({
    page,
  }) => {
    await page.getByTestId("tab-inspector").click();
    await withSp(
      page,
      (sp) => {
        sp.selection.getState().select("s1");
      },
      undefined,
    );

    // Inject three custom uniforms so the search has something to filter.
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    const newFrag = trivialShaderSources.fragment.replace(
      "uniform vec3 u_baseColor;",
      [
        "uniform vec3 u_baseColor;",
        "uniform float u_blurRadius;",
        "uniform vec3 u_tintColor;",
        "uniform float u_density;",
      ].join("\n"),
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

    const search = page.getByTestId("uniform-search");
    await expect(search).toBeVisible();

    // Initial: all three custom uniforms visible.
    await expect(
      page.locator("[data-uniform-name='u_blurRadius']"),
    ).toBeVisible();
    await expect(
      page.locator("[data-uniform-name='u_tintColor']"),
    ).toBeVisible();
    await expect(page.locator("[data-uniform-name='u_density']")).toBeVisible();

    // Filter by name substring.
    await search.fill("blur");
    await expect(
      page.locator("[data-uniform-name='u_blurRadius']"),
    ).toBeVisible();
    await expect(page.locator("[data-uniform-name='u_tintColor']")).toHaveCount(
      0,
    );
    await expect(page.locator("[data-uniform-name='u_density']")).toHaveCount(
      0,
    );

    // Filter by type — vec3 keeps tintColor (and baseColor) but not floats.
    await search.fill("vec3");
    await expect(
      page.locator("[data-uniform-name='u_tintColor']"),
    ).toBeVisible();
    await expect(
      page.locator("[data-uniform-name='u_blurRadius']"),
    ).toHaveCount(0);
    await expect(page.locator("[data-uniform-name='u_density']")).toHaveCount(
      0,
    );

    // No-match state.
    await search.fill("zzz_no_uniform_matches");
    await expect(page.getByTestId("uniform-search-empty")).toBeVisible();
    await expect(page.locator("[data-testid='uniform-row']")).toHaveCount(0);

    // Clear → all rows back.
    await search.fill("");
    await expect(
      page.locator("[data-uniform-name='u_blurRadius']"),
    ).toBeVisible();
    await expect(
      page.locator("[data-uniform-name='u_tintColor']"),
    ).toBeVisible();
    await expect(page.locator("[data-uniform-name='u_density']")).toBeVisible();
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
