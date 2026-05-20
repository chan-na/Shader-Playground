import { expect, test } from "@playwright/test";
import {
  bootApp,
  setGraph,
  trivialMeshGraph,
  trivialShaderSources,
} from "./helpers/fixtures";
import { readSp, waitForRev, withSp } from "./helpers/sp";

test.describe("Phase 21 — Inspector hint editor (annotation write-back)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: -240, y: 0 },
      s1: { x: 80, y: 0 },
      o1: { x: 400, y: 0 },
    });

    await page.getByTestId("tab-inspector").click();
    await withSp(page, (sp) => sp.selection.getState().select("s1"), undefined);

    // Add a plain float uniform so the editor has a slider to retarget.
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
        src: trivialShaderSources.fragment.replace(
          "uniform vec3 u_baseColor;",
          "uniform vec3 u_baseColor;\nuniform float u_test;",
        ),
      },
    );
    await waitForRev(page, before);
  });

  test("editing range/default/label writes a source comment and retargets the slider", async ({
    page,
  }) => {
    const row = page.locator(
      "[data-testid='uniform-row'][data-uniform-name='u_test']",
    );
    await expect(row).toBeVisible();

    // Open the editor for u_test.
    await row.getByTestId("uniform-edit-toggle").click();
    const editor = page.getByTestId("uniform-hint-editor");
    await expect(editor).toBeVisible();

    await editor.getByTestId("uniform-hint-min").fill("2");
    await editor.getByTestId("uniform-hint-max").fill("8");
    await editor.getByTestId("uniform-hint-step").fill("0.5");
    await editor.getByTestId("uniform-hint-default").fill("5");
    await editor.getByTestId("uniform-hint-label").fill("Power");

    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    await editor.getByTestId("uniform-hint-apply").click();
    await waitForRev(page, before);

    // Editor closes after apply.
    await expect(editor).toBeHidden();

    // The fragment source gained a canonical annotation comment.
    const frag = await readSp(page, (sp) => {
      const n = sp.graph.getState().nodes.find((x) => x.id === "s1");
      return String(n?.fragmentSource ?? "");
    });
    expect(frag).toContain(
      'uniform float u_test; // @range 2..8 @step 0.5 @default 5 @label "Power"',
    );

    // The slider re-derived its bounds from the new hints.
    const slider = row.locator("input[type='range']");
    await expect(slider).toHaveAttribute("min", "2");
    await expect(slider).toHaveAttribute("max", "8");

    // The label override now shows instead of the raw uniform name.
    await expect(row).toContainText("Power");
  });

  test("gear toggle opens and closes the editor", async ({ page }) => {
    const toggle = page
      .locator("[data-testid='uniform-row'][data-uniform-name='u_test']")
      .getByTestId("uniform-edit-toggle");
    await toggle.click();
    await expect(page.getByTestId("uniform-hint-editor")).toBeVisible();

    await toggle.click();
    await expect(page.getByTestId("uniform-hint-editor")).toBeHidden();

    // Cancel button also closes without writing.
    await toggle.click();
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    await page.getByTestId("uniform-hint-cancel").click();
    await expect(page.getByTestId("uniform-hint-editor")).toBeHidden();
    expect(await readSp(page, (sp) => sp.graph.getState().rev)).toBe(before);
  });
});
