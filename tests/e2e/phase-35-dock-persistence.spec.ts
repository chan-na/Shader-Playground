import { expect, test } from "@playwright/test";
import { boxOf } from "./helpers/dom";
import { bootApp, LAYOUT_STORAGE_KEY } from "./helpers/fixtures";

// Phase 35 — dock layout persistence and fallbacks: the statusbar "docked"
// counter, the ＋ Panel re-dock menu and Reset layout, localStorage
// persistence (`autoSave.ts` startDockLayoutPersistence / loadDockLayout),
// the empty-tree state, and the compact-viewport (≤990px) render fallback
// (`DockLayout.tsx` useCompactShell). Each test boots a fresh context, so
// localStorage never bleeds between tests.
test.describe("Phase 35 — dock persistence, ＋ Panel, empty state, compact viewport", () => {
  test("statusbar docked count + ＋ Panel close/reopen a tab", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const statusDocked = page.getByTestId("status-docked");
    await expect(statusDocked).toHaveText("5 panels docked");

    await page.getByTestId("tab-assets").locator(".panel-tab-close").click();
    await expect(statusDocked).toHaveText("4 panels docked");
    await expect(page.getByTestId("tab-assets")).toHaveCount(0);

    await page.getByTestId("dock-add-panel").click();
    await page.getByTestId("dock-add-panel-assets").click();
    await expect(statusDocked).toHaveText("5 panels docked");
    await expect(page.getByTestId("tab-assets")).toBeVisible();

    // Every panel is docked again — the menu shows its empty-menu copy.
    await page.getByTestId("dock-add-panel").click();
    await expect(page.locator(".tb-menu-list")).toContainText(
      "All panels are open",
    );
  });

  test("R9 — closed-tab and reset-layout changes survive a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    await page.getByTestId("tab-assets").locator(".panel-tab-close").click();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "4 panels docked",
    );

    // Poll localStorage rather than sleeping past the save debounce
    // (LAYOUT_SAVE_DEBOUNCE_MS).
    await page.waitForFunction((key) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return false;
      return !JSON.stringify(JSON.parse(raw)).includes("assets");
    }, LAYOUT_STORAGE_KEY);

    await page.reload();
    await bootApp(page);
    await expect(page.getByTestId("status-docked")).toHaveText(
      "4 panels docked",
    );
    await expect(page.getByTestId("tab-assets")).toHaveCount(0);

    await page.getByTestId("dock-reset-layout").click();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );

    await page.waitForFunction((key) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return false;
      return JSON.stringify(JSON.parse(raw)).includes("assets");
    }, LAYOUT_STORAGE_KEY);

    await page.reload();
    await bootApp(page);
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
  });

  // Schema-level corruption is unit-tested by `sanitizeDockLayoutSnapshot`
  // (src/ui/dock/snapshot.test.ts), which only ever sees already-parsed input.
  // This covers the one failure mode it can't: `JSON.parse` itself throwing,
  // which loadDockLayout's try/catch alone absorbs.
  test("R9: corrupted localStorage layout falls back to the default tree, and saving recovers", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "{corrupted!!");
    }, LAYOUT_STORAGE_KEY);

    await page.goto("/");
    await bootApp(page);

    // The parse threw, loadDockLayout returned null, and the store kept
    // createDefaultDockTree()'s shape untouched.
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
    await expect(page.locator(".shell-left")).toBeVisible();
    await expect(page.locator(".shell-right-top")).toBeVisible();
    await expect(page.locator(".shell-right-bottom")).toBeVisible();
    await expect(page.locator(".shell-code")).toBeVisible();

    await page.getByTestId("tab-assets").locator(".panel-tab-close").click();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "4 panels docked",
    );

    // The corrupted seed doesn't poison the save path — saveDockLayout
    // stringifies the live store without reading the old value back, so the
    // next debounced save overwrites it with valid JSON.
    await page.waitForFunction((key) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return false;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return false;
      }
      return !JSON.stringify(parsed).includes("assets");
    }, LAYOUT_STORAGE_KEY);
  });

  test("closing every leaf reaches the empty state; ＋ Panel re-docks out of it", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const closePanelButtons = page.getByRole("button", {
      name: "Close panel",
    });
    // Closing a leaf can rebalance the split tree and change DOM order, so
    // re-query `.first()` on every iteration rather than snapshotting a list.
    while ((await closePanelButtons.count()) > 0) {
      await closePanelButtons.first().click();
    }

    const empty = page.getByTestId("dock-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(
      "No panels docked — add one with ＋ Panel",
    );
    await expect(page.getByTestId("status-docked")).toHaveText(
      "0 panels docked",
    );

    await page.getByTestId("dock-add-panel").click();
    await page.getByTestId("dock-add-panel-nodeEditor").click();
    await expect(empty).toHaveCount(0);
  });

  test("R11 — compact viewport hides drag handles/splitters, layout is preserved on widen", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const dockedBefore = await page.getByTestId("status-docked").textContent();
    expect(dockedBefore).not.toBeNull();

    await page.setViewportSize({ width: 960, height: 800 });
    await expect(page.locator(".dock-header-grab")).toHaveCount(0);
    await expect(page.locator(".splitter")).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(".splitter").first()).toBeVisible();
    // A pure render fallback — the tree is never touched, so widening back
    // out restores the exact same docked-panel count.
    await expect(page.getByTestId("status-docked")).toHaveText(
      dockedBefore ?? "",
    );
  });

  // In compact mode DockLayout.tsx wires `noopDragStart` in place of
  // startLeafDrag/startTabDrag: the pointerdown handlers exist but never arm
  // a drag session.
  test("R11: compact viewport disarms docking — a tab drag produces no ghost", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    await page.setViewportSize({ width: 960, height: 800 });
    await expect(page.locator(".dock-root--compact")).toBeVisible();

    const assetsTab = page.getByTestId("tab-assets");
    const tab = await boxOf(assetsTab);

    await page.mouse.move(tab.cx, tab.cy);
    await page.mouse.down();
    // Well past the 4px pending→ghost threshold — a live startTabDrag would
    // have spawned a ghost by now.
    await page.mouse.move(tab.cx - 150, tab.cy + 60, { steps: 8 });

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );
    await expect(page.locator(".dock-drop-preview")).toHaveCount(0);

    await page.mouse.up();

    // The tree was never touched — the tab survives in place and the docked
    // count is unchanged.
    await expect(assetsTab).toBeVisible();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
  });
});
