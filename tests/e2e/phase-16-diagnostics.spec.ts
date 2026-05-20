import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { withSp } from "./helpers/sp";

/**
 * Phase 16 — developer diagnostics panel. The logger buffers entries regardless
 * of level; the panel reads that buffer. We push a deterministic marker via the
 * dev `__sp.log` handle so the test doesn't depend on incidental runtime logs.
 */
test.describe("Phase 16 — diagnostics panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("StatusBar toggle opens the panel, shows buffered logs, and clears", async ({
    page,
  }) => {
    await withSp(
      page,
      (sp) => sp.log.warn("app", "e2e-diagnostic-marker"),
      undefined,
    );

    const panel = page.getByTestId("diagnostics-panel");
    await expect(panel).toHaveCount(0);

    await page.getByTestId("open-diagnostics").click();
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("diagnostics-log-list")).toContainText(
      "e2e-diagnostic-marker",
    );

    await page.getByTestId("diagnostics-clear").click();
    await expect(page.getByTestId("diagnostics-log-list")).not.toContainText(
      "e2e-diagnostic-marker",
    );

    await page.getByTestId("open-diagnostics").click();
    await expect(panel).toHaveCount(0);
  });
});
