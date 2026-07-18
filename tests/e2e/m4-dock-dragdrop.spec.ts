import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

// M4/B7-U3 regression guard: `computeDropTarget`'s branch order (dockTree.ts
// L526-623) checks a region's own top TAB_BAR_DROP_PX zone *before* the
// shell's outer OUTER_DROP_BAND_PX bands (tab-bar branch L537-544, outer
// bands L545-582) — a cursor point can sit inside both an outer band AND a
// region's tab-bar zone at once (the nodeEditor leaf shares the shell's own
// top-left corner), and the tab-bar branch must win ("Add to tab bar", not
// "Dock left"/"Dock top"). Test 2 covers the complementary case — a leaf
// dragged (⣿ grab, `startLeafDrag`) via the shell-wide outer bottom band
// (OUTER_DROP_BAND_PX) then a region-interior edge split
// (REGION_EDGE_DROP_FRAC=0.22, L594-616, REGION_SPLIT_RATIO=0.4 on release,
// L698-707) in a single continuous drag. R1 ("no floating panels" —
// design/CHANGELOG.md §v1.4) backs the "5 panels docked" + zero-ghost
// assertions in both tests: every release re-docks somewhere, and pure
// re-dock operations (tab merge / region split) never change the docked
// panel count. Structure mirrors m2-dock-drag.spec.ts: serial, real
// page.mouse coordinates, page.goto("/") + bootApp(page) per test (fresh
// context ⇒ isolated state, no cross-test bleed).
test.describe("M4 — tab-bar zone priority + leaf drag outer/region combo", () => {
  test("tab-bar zone beats the outer band: tab merges into an edge panel header", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const viewportTab = page.getByTestId("tab-viewport");
    const tabBox = await viewportTab.boundingBox();
    if (tabBox === null) throw new Error("tab-viewport has no bounding box");
    const startCx = tabBox.x + tabBox.width / 2;
    const startCy = tabBox.y + tabBox.height / 2;

    const dockRoot = page.locator(".dock-root");
    const rootBox = await dockRoot.boundingBox();
    if (rootBox === null) throw new Error(".dock-root has no bounding box");

    await page.mouse.move(startCx, startCy);
    await page.mouse.down();

    // (20, 17) relative to .dock-root is *triple*-covered: x=20 < 42
    // (OUTER_DROP_BAND_PX) puts it in the outer left band, y=17 < 42 puts it
    // in the outer top band too, AND it's inside the nodeEditor leaf's
    // region — which starts at that same (0,0) corner — within that
    // region's own top 34px (TAB_BAR_DROP_PX) tab-bar strip. If
    // `computeDropTarget` checked the outer bands before the tab-bar zone,
    // this point would resolve to "Dock left"/"Dock top" instead of merging
    // into the tab bar — that's the exact priority regression this test
    // guards (dockTree.ts L537-544 must run before L545-582).
    const targetX = rootBox.x + 20;
    const targetY = rootBox.y + 17;
    await page.mouse.move(targetX, targetY, { steps: 10 });

    const preview = page.locator(".dock-drop-preview");
    await expect(preview).toBeVisible();
    await expect(page.locator(".dock-drop-preview-label")).toHaveText(
      "Add to tab bar",
    );

    await page.mouse.up();

    // No lingering drag ghost after release (R1 — never left mid-drag).
    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );

    // insertDetachedLeaf's center zone appends the dropped leaf's tabs after
    // the target leaf's existing tabs (dockTree.ts L692), so the merged
    // leaf's tabs[0] is still "nodeEditor" — leafPanelKind/legacyLeafClass
    // (dockLayoutModel.ts) therefore still resolve to "shell-left", not a
    // new/different slot class.
    await expect(
      page.locator('.shell-left [data-testid="tab-viewport"]'),
    ).toBeVisible();
    await expect(
      page.locator('.shell-left [data-testid="tab-nodeEditor"]'),
    ).toBeVisible();
    // The same center-merge sets `active: leaf.active` — the dropped leaf's
    // active tab (viewport) becomes the merged leaf's active tab.
    await expect(page.getByTestId("tab-viewport")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // A tab merge, not a close — no panel lost.
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
  });

  test("⣿ leaf drag: outer bottom band then a 22% edge split, with preview labels", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const grab = page.locator(".shell-right-top .dock-header-grab");
    const grabBox = await grab.boundingBox();
    if (grabBox === null) {
      throw new Error(".shell-right-top .dock-header-grab has no bounding box");
    }
    const startCx = grabBox.x + grabBox.width / 2;
    const startCy = grabBox.y + grabBox.height / 2;

    const dockRoot = page.locator(".dock-root");
    const rootBox = await dockRoot.boundingBox();
    if (rootBox === null) throw new Error(".dock-root has no bounding box");

    await page.mouse.move(startCx, startCy);
    await page.mouse.down();

    const label = page.locator(".dock-drop-preview-label");

    // Shell-wide bottom band: y within OUTER_DROP_BAND_PX(42) of the shell's
    // bottom edge, x = horizontal center (well clear of the left/right
    // bands — the left outer band is already covered by
    // m2-dock-drag.spec.ts, so this exercises the bottom side instead).
    await page.mouse.move(
      rootBox.x + rootBox.width / 2,
      rootBox.y + rootBox.height - 10,
      { steps: 8 },
    );
    await expect(label).toHaveText("Dock bottom");

    // The viewport leaf (dragged whole via the ⣿ grab → `startLeafDrag`) was
    // detached the moment the first sub-step above crossed the 4px
    // threshold — its 1-child column split collapsed, so the nodeEditor
    // leaf's region now spans the full former viewport+sidePanel column
    // height. x=100 (> 42, clear of the outer band) puts
    // fx=(100-0)/regionWidth ≈ 0.12, comfortably inside
    // REGION_EDGE_DROP_FRAC(0.22) of the region's left edge; y=35% of the
    // shell height keeps fy far from the top/bottom edges so "left" wins the
    // 4-way min unambiguously.
    await page.mouse.move(rootBox.x + 100, rootBox.y + rootBox.height * 0.35, {
      steps: 8,
    });
    await expect(label).toHaveText("Split left");

    await page.mouse.up();

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );

    const viewportLeaf = page.locator(".shell-right-top");
    const nodeEditorLeaf = page.locator(".shell-left");
    await expect(viewportLeaf).toBeVisible();
    await expect(nodeEditorLeaf).toBeVisible();
    const viewportBox = await viewportLeaf.boundingBox();
    const nodeEditorBox = await nodeEditorLeaf.boundingBox();
    if (viewportBox === null || nodeEditorBox === null) {
      throw new Error("shell-right-top/shell-left has no bounding box");
    }
    // insertDetachedLeaf's "left" zone makes the dragged leaf `a`
    // (REGION_SPLIT_RATIO=0.4) and the old nodeEditor node `b` — the
    // viewport leaf lands to the left of nodeEditor inside nodeEditor's old
    // region.
    expect(viewportBox.x).toBeLessThan(nodeEditorBox.x);
    // A region split, not a close — no panel lost.
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
  });
});
