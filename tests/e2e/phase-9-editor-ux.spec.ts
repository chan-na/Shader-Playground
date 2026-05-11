import { expect, test } from "@playwright/test";
import {
  bootApp,
  setGraph,
  trivialMeshGraph,
  trivialShaderSources,
} from "./helpers/fixtures";
import { readSp, waitForRev, withSp } from "./helpers/sp";

test.describe("Phase 9 — editor UX", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: -240, y: 0 },
      s1: { x: 80, y: 0 },
      o1: { x: 400, y: 0 },
    });
    await page.getByTestId("tab-inspector").click();
    await withSp(
      page,
      (sp) => {
        sp.selection.getState().select("s1");
      },
      undefined,
    );
  });

  test("GLSL `// @range 0..5 @default 2.5` hint propagates to inspector", async ({
    page,
  }) => {
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    const frag = trivialShaderSources.fragment.replace(
      "out vec4 fragColor;",
      "uniform float u_intensity; // @range 0..5 @default 2.5 @step 0.25\nout vec4 fragColor;",
    );
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().updateShaderSource(args.id, {
          fragmentSource: args.src,
        });
      },
      { id: "s1", src: frag },
    );
    await waitForRev(page, before);

    const row = page.locator("[data-uniform-name='u_intensity']");
    await expect(row).toBeVisible();
    // The slider input should reflect min/max/step pulled from the hint.
    const range = row.locator("input[type='range']");
    await expect(range).toHaveAttribute("min", "0");
    await expect(range).toHaveAttribute("max", "5");
    await expect(range).toHaveAttribute("step", "0.25");
  });

  test("Spacebar toggles timeStore.playing", async ({ page }) => {
    // Make sure focus is NOT inside CodeMirror.
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    const before = await readSp(page, (sp) => sp.time.getState().playing);
    await page.keyboard.press("Space");
    await expect
      .poll(() => readSp(page, (sp) => sp.time.getState().playing))
      .toBe(!before);
    await page.keyboard.press("Space");
    await expect
      .poll(() => readSp(page, (sp) => sp.time.getState().playing))
      .toBe(before);
  });

  test("Cmd+Z undoes the last node addition", async ({ page }) => {
    const startCount = await readSp(
      page,
      (sp) => sp.graph.getState().nodes.length,
    );

    await withSp(
      page,
      (sp) => {
        sp.graph.getState().addNode({
          id: "undo_target",
          kind: "param",
          paramKind: "float",
          value: 0.5,
        });
      },
      undefined,
    );

    await expect
      .poll(() => readSp(page, (sp) => sp.graph.getState().nodes.length))
      .toBe(startCount + 1);

    // On mac the shortcut is Meta+Z (Playwright maps Meta to Cmd on darwin).
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Meta+z");

    await expect
      .poll(() => readSp(page, (sp) => sp.graph.getState().nodes.length))
      .toBe(startCount);
  });

  test("Cmd+K opens the command palette", async ({ page }) => {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Meta+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toBeHidden();
  });
});
