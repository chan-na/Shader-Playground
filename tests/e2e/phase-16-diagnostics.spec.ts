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
    // R5: Diagnostics는 상태바 토글 → 하단 트랜지언트 오버레이(172px). Not a Side
    // Panel tab — `tab-diagnostics` no longer exists (SidePanel/
    // DockPanelHeader legacy path removed). The StatusBar toggle's
    // aria-pressed + the overlay's own testid are the new-path activation
    // signals.
    await expect(page.getByTestId("open-diagnostics")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("diagnostics-overlay")).toBeVisible();
    await expect(page.getByTestId("diagnostics-log-list")).toContainText(
      "e2e-diagnostic-marker",
    );

    await page.getByTestId("diagnostics-clear").click();
    await expect(page.getByTestId("diagnostics-log-list")).not.toContainText(
      "e2e-diagnostic-marker",
    );

    await page.getByTestId("open-diagnostics").click();
    await expect(panel).toHaveCount(0);
    // R5 (B5-U5): the overlay itself (not just its inner panel testid) must
    // unmount on re-toggle close — guards against the overlay wrapper
    // lingering (e.g. StatusOverlays still rendering a stale open/problemsOpen
    // state) while the inner DiagnosticsPanel disappears.
    await expect(page.getByTestId("diagnostics-overlay")).toHaveCount(0);
  });
});
