import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { readSp } from "./helpers/sp";

/**
 * Phase 38 — mental model correction I: render state (E-2,
 * docs/learnability-plan-2026-08.md T3). `core/graph/renderState.ts`'s
 * `renderStateFor` is the single function both `execute.ts` (via
 * `applyRenderState`) and the Pass Inspector's `State` column call — this
 * spec checks the column actually reaches the DOM with the same
 * fullscreen/mesh distinction `execute.ts` renders with, not that any new
 * computation is correct. Also covers the render-state footnote: blend is
 * never *enabled* anywhere in this codebase, so no in-pass alpha blending
 * happens — but outColor.a is NOT discarded (it lands in the pass FBO,
 * reaches downstream samplers, and the alpha:true canvas composite makes it
 * visible on screen; see renderState.ts's module doc). The footnote states
 * that precisely, and this spec pins its two load-bearing substrings.
 */

/** Load the built-in Chain demo through the real toolbar preset (mirrors
 * phase-36-pipeline-visibility.spec.ts's `loadChainDemo`, duplicated rather
 * than imported so this spec stays independently runnable/decoupled). */
async function loadChainDemo(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Presets" }).click();
  await page.getByRole("menuitem", { name: "Chain", exact: true }).click();
  await expect
    .poll(() =>
      readSp(page, (sp) =>
        sp.graph.getState().nodes.find((n) => n.id === "tonemap1")
          ? "ok"
          : "no",
      ),
    )
    .toBe("ok");
}

test.describe("Phase 38 — render state visibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("boot demo: mesh-connected shader1 shows depth on, blend/cull off", async ({
    page,
  }) => {
    await page.getByTestId("status-passes").click();
    await expect(page.getByTestId("passes-overlay")).toBeVisible();

    const rows = page.getByTestId("pass-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-node-id", "shader1");

    const stateCell = page.locator(
      '[data-testid="pass-row"][data-node-id="shader1"] [data-testid="pass-state"]',
    );
    await expect(stateCell).toHaveText("blend off · cull off · depth on");
  });

  test("Chain demo: every fullscreen pass shows depth off", async ({
    page,
  }) => {
    await loadChainDemo(page);

    await page.getByTestId("status-passes").click();
    await expect(page.getByTestId("passes-overlay")).toBeVisible();

    const rows = page.getByTestId("pass-row");
    await expect(rows).toHaveCount(3);

    for (const id of ["noise1", "blur1", "tonemap1"]) {
      const cell = page.locator(
        `[data-testid="pass-row"][data-node-id="${id}"] [data-testid="pass-state"]`,
      );
      await expect(cell).toHaveText("blend off · cull off · depth off");
    }
  });

  test("pass-state-note is visible and describes blend-off + where outColor.a actually goes", async ({
    page,
  }) => {
    await page.getByTestId("status-passes").click();
    await expect(page.getByTestId("passes-overlay")).toBeVisible();

    const note = page.getByTestId("pass-state-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("outColor.a");
    await expect(note).toContainText("blend off");
  });
});
