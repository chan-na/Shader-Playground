import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

/** R9 localStorage key — mirrors `autoSave.ts`'s module-private `LAYOUT_KEY`
 * (not exported, so the string is duplicated here; see that file's R9
 * section for the persistence contract this spec is guarding). */
const LAYOUT_STORAGE_KEY = "shader-playground.dock-layout";

// M3/B6-U4 regression guard: the statusbar "docked" counter (B6-U2), the
// ＋ Panel re-dock menu + Reset layout (B6-U2), the R9 localStorage
// persistence (autoSave.ts startDockLayoutPersistence), the R1 empty-state
// fallback (DockLayout.tsx `.dock-root` null-tree branch), and the R11
// compact-viewport fallback (DockLayout.tsx useCompactShell, ≤990px) are
// each built in earlier B6 units but never exercised together end-to-end.
// Structure mirrors m2-dock-drag.spec.ts: serial, page.goto("/") + bootApp
// per test (fresh context ⇒ isolated localStorage, no cross-test bleed).
test.describe("M3/B6 — dock persistence, ＋ Panel, empty state, compact viewport", () => {
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

    // Every panel is docked again — the menu trigger re-opens showing the
    // "All panels are open" empty-menu copy (AppToolbar.tsx tb-menu-empty).
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

    // Poll localStorage instead of a fixed sleep — stable regardless of how
    // close the 500ms save debounce (LAYOUT_SAVE_DEBOUNCE_MS) is to firing.
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

  test("closing every leaf reaches the empty state; ＋ Panel re-docks out of it", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const closePanelButtons = page.getByRole("button", {
      name: "Close panel",
    });
    // The default tree has 4 leaves (one holds 2 tabs) — closing a leaf can
    // collapse/rebalance the split tree and change DOM order, so re-query
    // `.first()` fresh on every iteration rather than snapshotting a list.
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
    // R11 is a pure render fallback — the tree itself is never touched, so
    // widening back out must restore the exact same docked-panel count.
    await expect(page.getByTestId("status-docked")).toHaveText(
      dockedBefore ?? "",
    );
  });
});
