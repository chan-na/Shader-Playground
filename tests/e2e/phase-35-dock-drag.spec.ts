import { expect, test } from "@playwright/test";
import { boxOf } from "./helpers/dom";
import { bootApp } from "./helpers/fixtures";

// Phase 35 — dock drag & drop with real pointer coordinates: tab and ⣿ grab
// pointerdown → 4px-threshold ghost → drop preview → release-time re-dock.
// Every release force-docks somewhere ("no floating panels"), so each test
// ends with zero drag ghosts and, for pure re-docks, an unchanged
// "5 panels docked" count. Drop-target priority and thresholds live in
// `dockTree.ts` (`computeDropTarget`, `insertDetachedLeaf`,
// `canMergeDockTabs`). Every test boots a fresh page.
test.describe("Phase 35 — dock drag & drop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("tab drag splits a region: dragging the Assets tab to the left band docks it into a new left leaf", async ({
    page,
  }) => {
    const start = await boxOf(page.getByTestId("tab-assets"));
    const rootBox = await boxOf(page.locator(".dock-root"));
    // Left outer drop band is `x < 42` relative to .dock-root — x≈10 is
    // well inside it. y = shell vertical centre.
    const targetX = rootBox.x + 10;
    const targetY = rootBox.y + rootBox.height / 2;

    await page.mouse.move(start.cx, start.cy);
    await page.mouse.down();
    // >4px threshold on the first sub-step converts pending → ghost; the
    // remaining sub-steps update the ghost and recompute the drop target,
    // landing on "Dock left" by the final step.
    await page.mouse.move(targetX, targetY, { steps: 8 });

    const preview = page.locator(".dock-drop-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Dock left");

    await page.mouse.up();

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );

    const endedTab = page.getByTestId("tab-assets");
    await expect(endedTab).toBeVisible();
    // Re-docked into a brand-new leaf on the left edge of the shell.
    expect((await boxOf(endedTab)).x).toBeLessThan(start.x);
  });

  test("release outside any target force-docks — no floating/vanished panel", async ({
    page,
  }) => {
    const start = await boxOf(page.getByTestId("tab-inspector"));
    const rootBox = await boxOf(page.locator(".dock-root"));
    // Release above the shell content, inside the toolbar band — outside
    // every dock region. `fallbackDropTarget` must still dock it.
    const releaseX = rootBox.x + rootBox.width / 2;
    const releaseY = Math.max(0, rootBox.y - 20);

    await page.mouse.move(start.cx, start.cy);
    await page.mouse.down();
    await page.mouse.move(releaseX, releaseY, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );
    // The tab survives the release — still mounted somewhere in the tree.
    await expect(page.getByTestId("tab-inspector")).toBeVisible();
  });

  // `computeDropTarget` checks a region's own top TAB_BAR_DROP_PX zone
  // *before* the shell's outer OUTER_DROP_BAND_PX bands. Code owns the
  // shell's top-left corner, so a point there sits in both — and the tab-bar
  // zone must win. Viewport/code are excluded from mixed-kind tab merges, so
  // the drop falls back to an edge split instead of merging into Code.
  test("tab-bar zone beats the outer band: viewport falls back to a split, never merges into Code (T1)", async ({
    page,
  }) => {
    const viewportTab = page.getByTestId("tab-viewport");
    const tab = await boxOf(viewportTab);
    const rootBox = await boxOf(page.locator(".dock-root"));

    await page.mouse.move(tab.cx, tab.cy);
    await page.mouse.down();

    // (20, 17) relative to .dock-root is triple-covered: x < 42 (outer left
    // band), y < 42 (outer top band), and inside Code's top 34px tab-bar
    // strip. Outer bands checked first would resolve to "Dock left"/"Dock
    // top" — the priority regression this guards.
    await page.mouse.move(rootBox.x + 20, rootBox.y + 17, { steps: 10 });

    await expect(page.locator(".dock-drop-preview")).toBeVisible();
    await expect(page.locator(".dock-drop-preview-label")).toHaveText(
      "Add to tab bar",
    );

    await page.mouse.up();

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );

    // canMergeDockTabs rejects the merge, so no viewport tab lands inside
    // `.shell-code` and Code's tab bar still holds exactly its one tab.
    await expect(
      page.locator('.shell-code [data-testid="tab-viewport"]'),
    ).toHaveCount(0);
    await expect(page.locator(".shell-code .panel-tab")).toHaveCount(1);

    // The dropped viewport panel is not lost — docked as its own leaf.
    await expect(viewportTab).toBeVisible();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );

    // The fallback split lands the viewport leaf to the right of Code (inside
    // Code's former slice) and left of the untouched Node Editor.
    const codeBox = await boxOf(page.locator(".shell-code"));
    const viewportBox = await boxOf(page.locator(".shell-right-top"));
    const nodeEditorBox = await boxOf(page.locator(".shell-left"));
    expect(viewportBox.x).toBeGreaterThan(codeBox.x);
    expect(viewportBox.x).toBeLessThan(nodeEditorBox.x);
  });

  // The allowed side of the mixed-kind merge rule: neither side is
  // viewport/code, so Assets merges into Node Editor's tab bar. The merged
  // leaf's legacy class is kind-based (`leafPanelKind` reads `leaf.active`),
  // so it tracks whichever tab is active without a second physical leaf.
  test("S5: dropping a tab into a hetero leaf merges tabs, and the merged leaf's class tracks the active tab", async ({
    page,
  }) => {
    const tab = await boxOf(page.getByTestId("tab-assets"));
    const nodeEditorBox = await boxOf(page.locator(".shell-left"));

    await page.mouse.move(tab.cx, tab.cy);
    await page.mouse.down();

    // Node Editor's own tab-bar zone: its horizontal centre (nowhere near an
    // outer band), 17px from its top (< TAB_BAR_DROP_PX=34).
    await page.mouse.move(nodeEditorBox.cx, nodeEditorBox.y + 17, {
      steps: 10,
    });

    await expect(page.locator(".dock-drop-preview")).toBeVisible();
    await expect(page.locator(".dock-drop-preview-label")).toHaveText(
      "Add to tab bar",
    );

    await page.mouse.up();

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );

    // Scope through the merged leaf with `has:` — after this merge there are
    // two `.shell-right-bottom` elements (the inspector-only original and
    // this nodeEditor+assets leaf, whose active "assets" makes it sidePanel).
    const mergedLeaf = page.locator(".dock-leaf", {
      has: page.getByTestId("tab-nodeEditor"),
    });
    await expect(mergedLeaf).toHaveCount(1);
    await expect(mergedLeaf.getByTestId("tab-assets")).toBeVisible();
    await expect(mergedLeaf.getByTestId("tab-assets")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // insertDetachedLeaf's centre-merge keeps the dropped leaf's active tab,
    // so the merged leaf's class follows Assets right after the drop.
    await expect(mergedLeaf).toHaveClass(/shell-right-bottom/);

    // Selecting the other tab flips both the active tab and the leaf's
    // kind-derived class — same physical leaf, no remount.
    await mergedLeaf.getByTestId("tab-nodeEditor").click();
    await expect(mergedLeaf).toHaveClass(/shell-left/);
    await expect(mergedLeaf.getByTestId("tab-nodeEditor")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("⣿ leaf drag: outer bottom band then a 22% edge split into Code's region, with preview labels", async ({
    page,
  }) => {
    const grab = await boxOf(
      page.locator(".shell-right-top .dock-header-grab"),
    );
    const rootBox = await boxOf(page.locator(".dock-root"));

    await page.mouse.move(grab.cx, grab.cy);
    await page.mouse.down();

    const label = page.locator(".dock-drop-preview-label");

    // Shell-wide bottom band: within OUTER_DROP_BAND_PX(42) of the bottom
    // edge, horizontally centred (clear of the left/right bands).
    await page.mouse.move(rootBox.cx, rootBox.y + rootBox.height - 10, {
      steps: 8,
    });
    await expect(label).toHaveText("Dock bottom");

    // The viewport leaf was detached once the first sub-step crossed the 4px
    // threshold, collapsing its column split; Code's region (x:[0, ~357]) is
    // unaffected. x = +60 gives fx ≈ 0.17 inside Code — past the 42px outer
    // band and under REGION_EDGE_DROP_FRAC(0.22), so an edge split wins over
    // a centre merge; y = 35% keeps "left" the unambiguous nearest edge.
    await page.mouse.move(rootBox.x + 60, rootBox.y + rootBox.height * 0.35, {
      steps: 8,
    });
    await expect(label).toHaveText("Split left");

    await page.mouse.up();

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );

    const viewportLeaf = page.locator(".shell-right-top");
    const codeLeaf = page.locator(".shell-code");
    await expect(viewportLeaf).toBeVisible();
    await expect(codeLeaf).toBeVisible();
    // insertDetachedLeaf's "left" zone makes the dragged leaf `a`
    // (REGION_SPLIT_RATIO=0.4) and the old Code node `b`.
    expect((await boxOf(viewportLeaf)).x).toBeLessThan(
      (await boxOf(codeLeaf)).x,
    );
    // A region split, not a close — no panel lost.
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
  });
});
