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
    // S7/T3 (design/CHANGELOG.md §v1.6): 오버레이는 헤더 아래 26px 단일 행
    // 메트릭 스트립만 — 전체 2×2 카드는 억제된다.
    const strip = page.getByTestId("diagnostics-metric-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toHaveCSS("height", "26px");
    await expect(strip).toContainText("Draws");
    await expect(strip).toContainText("compiled"); // Shaders 값 (linkedProgramsValue)
    await expect(page.getByTestId("diagnostics-metric-cards")).toHaveCount(0);
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
    await expect(strip).toHaveCount(0);
  });

  test("metric strip is diagnostics-only — absent from the problems overlay (T4)", async ({
    page,
  }) => {
    await page.getByTestId("status-problems").click();
    await expect(page.getByTestId("problems-overlay")).toBeVisible();
    await expect(page.getByTestId("diagnostics-metric-strip")).toHaveCount(0);
    await expect(page.getByTestId("diagnostics-metric-cards")).toHaveCount(0);
    // 같은 172px 영역이 diagnostics로 전환되면 스트립이 나타난다 (debugUiStore 상호 배타).
    await page.getByTestId("open-diagnostics").click();
    await expect(page.getByTestId("diagnostics-overlay")).toBeVisible();
    await expect(page.getByTestId("diagnostics-metric-strip")).toBeVisible();
  });
});
