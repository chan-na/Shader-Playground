import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

// M4/B7-U3 regression guard, retargeted for v2.0's breaking layout
// (design/App Shell.dc.html SSoT + design/CHANGELOG.md §v2.0). v2.0 default
// tree (dockTree.createDefaultDockTree, 1440×900 viewport, `.dock-root`
// ≈1434×820): `row 0.25 [ code | row 0.60 [ nodeEditor | col 0.52
// [viewport / (inspector,assets)] ] ]` — Code now owns the shell's top-left
// corner (root row split's `a`/left child), not Node Editor as it did
// pre-v2.0.
//
// `computeDropTarget`'s branch order (dockTree.ts L560-657) checks a
// region's own top `TAB_BAR_DROP_PX` zone *before* the shell's outer
// `OUTER_DROP_BAND_PX` bands — a cursor point can sit inside both an outer
// band AND a region's tab-bar zone at once (the leaf occupying the shell's
// own top-left corner shares that corner with the outer left/top bands), and
// the tab-bar branch must win ("Add to tab bar", not "Dock left"/"Dock
// top"). Test 1 exercises this at Code's corner (the v2.0 leaf that now sits
// there) and additionally guards **T1** (CHANGELOG §v1.6 T1 / §v2.0 S5 —
// viewport/code are excluded from hetero tab merges): dropping a viewport tab
// onto Code's tab bar must NOT merge into Code's leaf — `insertDetachedLeaf`
// falls back to a same-geometry edge split instead (dockTree.ts L738-749),
// so the panel still lands somewhere and no panel is lost (R1).
//
// Test 1b is new in this pass: it exercises the **allowed** side of S5 — a
// hetero merge that v2.0's `leafPanelKind`(v2.0: `leaf.active`-based, not
// `tabs[0]`) lets through because neither side is viewport/code. Dropping
// Assets into Node Editor's tab bar merges the tabs, and the merged leaf's
// legacy class (used by `legacyLeafClass`/CSS, kind-based not
// position-based) tracks whichever tab is currently active — flipping
// between `.shell-right-bottom` and `.shell-left` as the active tab changes,
// without ever creating a second physical leaf.
//
// Test 2 covers the complementary case — a leaf dragged (⣿ grab,
// `startLeafDrag`) via the shell-wide outer bottom band
// (`OUTER_DROP_BAND_PX`) then a region-interior edge split
// (`REGION_EDGE_DROP_FRAC`=0.22, L628, `REGION_SPLIT_RATIO`=0.4 on release,
// L758-768) in a single continuous drag — now landing inside Code's region
// (v2.0's leftmost, narrowest region) instead of Node Editor's old
// full-column one.
//
// R1 ("no floating panels" — design/CHANGELOG.md §v1.4) backs the "5 panels
// docked" + zero-ghost assertions in every test here: every release re-docks
// somewhere, and pure re-dock operations (tab merge / region split) never
// change the docked panel count. Structure mirrors m2-dock-drag.spec.ts:
// serial, real page.mouse coordinates, page.goto("/") + bootApp(page) per
// test (fresh context ⇒ isolated state, no cross-test bleed).
test.describe("M4 — tab-bar zone priority + hetero-merge guard + leaf drag outer/region combo", () => {
  test("tab-bar zone beats the outer band: viewport falls back to a split, never merges into Code (T1)", async ({
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
    // in the outer top band too, AND it's inside the Code leaf's region —
    // which starts at that same (0,0) corner in v2.0 (root row split's `a`
    // child) — within that region's own top 34px (TAB_BAR_DROP_PX) tab-bar
    // strip. If `computeDropTarget` checked the outer bands before the
    // tab-bar zone, this point would resolve to "Dock left"/"Dock top"
    // instead of the tab-bar zone — that's the exact priority regression
    // this test guards (dockTree.ts's tab-bar branch must run before its
    // outer-band branches).
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

    // T1 (dockTree.ts canMergeDockTabs): Code's leaf has tabs:["code"] and
    // the dragged leaf is tabs:["viewport"] — neither is a solo match for
    // the same exclusive kind, so the merge is rejected and
    // `insertDetachedLeaf` falls back to a `zone:"right"`-shaped split
    // instead (Code keeps its own tabs, the dropped viewport becomes a
    // sibling leaf) — no viewport tab ever lands inside `.shell-code`, and
    // Code's own tab bar still holds exactly its one tab.
    await expect(
      page.locator('.shell-code [data-testid="tab-viewport"]'),
    ).toHaveCount(0);
    await expect(page.locator(".shell-code .panel-tab")).toHaveCount(1);

    // The dropped viewport panel is not lost (R1) — it's still fully
    // visible and docked, just as its own leaf rather than merged into Code.
    await expect(viewportTab).toBeVisible();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );

    // Geometry proves the fallback landed where T1's split-not-merge branch
    // predicts: the new viewport leaf sits to the right of Code (inside
    // Code's former 25% slice, split 60/40) and to the left of Node Editor
    // (untouched, still the row split's other child).
    const codeBox = await page.locator(".shell-code").boundingBox();
    const viewportBox = await page.locator(".shell-right-top").boundingBox();
    const nodeEditorBox = await page.locator(".shell-left").boundingBox();
    if (codeBox === null || viewportBox === null || nodeEditorBox === null) {
      throw new Error("shell-code/shell-right-top/shell-left missing box");
    }
    expect(viewportBox.x).toBeGreaterThan(codeBox.x);
    expect(viewportBox.x).toBeLessThan(nodeEditorBox.x);
  });

  test("S5: dropping a tab into a hetero leaf merges tabs, and the merged leaf's class tracks the active tab", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const assetsTab = page.getByTestId("tab-assets");
    const tabBox = await assetsTab.boundingBox();
    if (tabBox === null) throw new Error("tab-assets has no bounding box");
    const startCx = tabBox.x + tabBox.width / 2;
    const startCy = tabBox.y + tabBox.height / 2;

    const nodeEditorBox = await page.locator(".shell-left").boundingBox();
    if (nodeEditorBox === null) {
      throw new Error(".shell-left has no bounding box");
    }

    await page.mouse.move(startCx, startCy);
    await page.mouse.down();

    // Node Editor's own tab-bar zone: x = its horizontal center (nowhere
    // near an outer band), y = 17px from its top (< TAB_BAR_DROP_PX=34) —
    // neither viewport nor code is involved (nodeEditor/assets), so T1's
    // exclusion doesn't apply and the merge is allowed.
    await page.mouse.move(
      nodeEditorBox.x + nodeEditorBox.width / 2,
      nodeEditorBox.y + 17,
      { steps: 10 },
    );

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

    // The merged leaf now carries both tabs — scope every query through it
    // with a `has:` filter, because after this merge there are *two*
    // `.shell-right-bottom` elements in the DOM: the original sidePanel leaf
    // (now inspector-only) and this merged leaf (nodeEditor+assets, active
    // "assets" ⇒ leafPanelKind resolves it to "sidePanel" too).
    const mergedLeaf = page.locator(".dock-leaf", {
      has: page.getByTestId("tab-nodeEditor"),
    });
    await expect(mergedLeaf).toHaveCount(1);
    await expect(mergedLeaf.getByTestId("tab-assets")).toBeVisible();
    await expect(mergedLeaf.getByTestId("tab-assets")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // insertDetachedLeaf's center-merge sets `active: leaf.active` (the
    // dropped leaf's own active tab) — so the merged leaf's kind (and thus
    // its legacy class) follows Assets right after the drop.
    await expect(mergedLeaf).toHaveClass(/shell-right-bottom/);

    // Selecting the other tab flips both the active tab *and* the leaf's
    // kind-derived class (S5: `leafPanelKind` is active-based, not
    // tabs[0]-based) — same physical leaf, no remount/new element.
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
    // m2-dock-drag.spec.ts, so this exercises the bottom side instead). This
    // step is unaffected by the v2.0 tree shape (outer bands are shell-wide,
    // not region-relative).
    await page.mouse.move(
      rootBox.x + rootBox.width / 2,
      rootBox.y + rootBox.height - 10,
      { steps: 8 },
    );
    await expect(label).toHaveText("Dock bottom");

    // The viewport leaf (dragged whole via the ⣿ grab → `startLeafDrag`) was
    // detached the moment the first sub-step above crossed the 4px
    // threshold — its 1-child column split (col 0.52 [viewport / sidePanel])
    // collapsed, so the sidePanel leaf now spans that entire former column's
    // height. Code's own region (root row split's untouched `a` child,
    // x:[0, ~357]) is unaffected by that collapse. x = rootBox.x + 60 puts
    // fx = (60 − 0) / ~357 ≈ 0.17 inside Code's region — comfortably past
    // OUTER_DROP_BAND_PX(42, so the outer-left band doesn't win first) and
    // under REGION_EDGE_DROP_FRAC(0.22, so an edge split wins over a center
    // merge); y = 35% of the shell height keeps fy far from the top/bottom
    // edges so "left" wins the 4-way min unambiguously.
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
    const viewportBox = await viewportLeaf.boundingBox();
    const codeBox = await codeLeaf.boundingBox();
    if (viewportBox === null || codeBox === null) {
      throw new Error("shell-right-top/shell-code has no bounding box");
    }
    // insertDetachedLeaf's "left" zone makes the dragged leaf `a`
    // (REGION_SPLIT_RATIO=0.4) and the old Code node `b` — the viewport leaf
    // lands to the left of Code inside Code's old region.
    expect(viewportBox.x).toBeLessThan(codeBox.x);
    // A region split, not a close — no panel lost.
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );
  });
});
