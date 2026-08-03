import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

/**
 * Phase 38 — mental-model correction (F-1, `docs/learnability-plan-2026-08.md`
 * T3). HelpModal gains a "Coordinate Spaces" section listing verified facts
 * about the app's coordinate conventions (v_uv, gl_FragCoord, u_mouse, image
 * upload flip, thumbnail flip). This is a pure UI addition on top of the
 * existing shortcuts modal — the coordinate section coexists with the
 * pre-existing shortcut sections and the Esc-to-close behavior is unchanged.
 */
test.describe("Phase 38 — HelpModal coordinate-system card", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("Open help reveals the coordinate-spaces section with verified facts, and Esc closes it", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Open help" }).click();

    const modal = page.getByTestId("help-modal");
    await expect(modal).toBeVisible();

    const coords = page.getByTestId("help-coordinates");
    await expect(coords).toBeVisible();
    await expect(coords).toContainText("좌하단");
    await expect(coords).toContainText("UNPACK_FLIP_Y_WEBGL");

    // Pre-existing shortcut sections still render alongside the new section
    // (regression guard — the addition must not replace anything).
    await expect(modal).toContainText("Node Graph");

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });
});
