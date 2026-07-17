import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

/** R9 localStorage key — mirrors `autoSave.ts`'s module-private `LAYOUT_KEY`
 * (not exported, so the string is duplicated here; see that file's R9
 * section for the persistence contract this spec is guarding). Same
 * duplication convention as m3-dock-b6.spec.ts. */
const LAYOUT_STORAGE_KEY = "shader-playground.dock-layout";

// M6/B7-U5 regression guard: two dock-layout fallback paths that never got
// their own end-to-end exercise — R9's corrupted-localStorage recovery
// (`autoSave.ts` loadDockLayout's try/catch swallowing a JSON.parse throw
// and returning null so the caller silently keeps the default tree) and
// R11's compact-viewport drag disarm (`DockLayout.tsx`'s `noopDragStart`,
// wired in place of `startLeafDrag`/`startTabDrag` once `useCompactShell()`
// is true — the pointerdown handlers still exist but do nothing, so a drag
// never arms in the first place). Schema-variant corruption (wrong field
// types, missing fields, out-of-range ratios) is already exhaustively
// unit-tested by `sanitizeDockLayoutSnapshot` in src/state/dockTree.test.ts
// — that function only ever runs on already-`JSON.parse`d input, so this
// spec covers the one failure mode it can't: `JSON.parse` itself throwing on
// unparsable garbage, which is `loadDockLayout`'s try/catch's job alone.
// Structure mirrors m3-dock-b6.spec.ts: serial, page.goto("/") +
// bootApp(page) per test (fresh context ⇒ isolated localStorage, no
// cross-test bleed).
test.describe("M6 — dock layout fallback: corrupted localStorage, compact drag disarm", () => {
  test("R9: corrupted localStorage layout falls back to the default tree, and saving recovers", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "{corrupted!!");
    }, LAYOUT_STORAGE_KEY);

    await page.goto("/");
    await bootApp(page);

    // loadDockLayout's JSON.parse threw, the catch returned null, and
    // startDockLayoutPersistence's `saved !== null` guard never fired — the
    // store keeps createDefaultDockTree()'s shape untouched.
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

    // The corrupted seed doesn't poison the save path — saveDockLayout is a
    // plain JSON.stringify of the live store (no read-back of the old
    // value), so the next debounced tick overwrites it with valid JSON. Same
    // polling pattern as m3-dock-b6.spec.ts's R9 test.
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

  test("R11: compact viewport disarms docking — a tab drag produces no ghost", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    await page.setViewportSize({ width: 960, height: 800 });
    await expect(page.locator(".dock-root--compact")).toBeVisible();

    const assetsTab = page.getByTestId("tab-assets");
    const box = await assetsTab.boundingBox();
    if (box === null) throw new Error("tab-assets has no bounding box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Well past the 4px pending→ghost threshold — under startTabDrag this
    // move would already have spawned a ghost by now. Under compact's
    // noopDragStart it's inert: no drag session was ever started, so this is
    // just an ordinary mousemove with the button held.
    await page.mouse.move(cx - 150, cy + 60, { steps: 8 });

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );
    await expect(page.locator(".dock-drop-preview")).toHaveCount(0);

    await page.mouse.up();

    // The tree itself was never touched — the tab survives in place and the
    // docked count is unchanged. Layout preservation across the
    // compact/wide boundary and handle/splitter removal are already covered
    // by m3-dock-b6.spec.ts's R11 test; this one only proves the drag never
    // armed to begin with.
    await expect(assetsTab).toBeVisible();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
  });
});
