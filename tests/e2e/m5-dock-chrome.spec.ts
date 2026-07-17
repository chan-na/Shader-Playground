import { expect, test } from "@playwright/test";
import { bootApp, setDockTree } from "./helpers/fixtures";

// M5/B7-U4 regression guard: four dock-header/divider behaviors introduced by
// v1.4's Docking Prototype.dc.html chrome that never got an end-to-end
// exercise of their own.
//
// R6 (header ✕ vs tab ✕): `dockStore.closePanel(path)` (header ✕,
// DockPanelHeader.tsx's `.dock-header-btn--close`) removes every tab on the
// leaf, while `dockStore.closeTab(id)` (a single tab's own `.panel-tab-close`
// ✕) removes just that one tab and only reassigns `active` if the closed tab
// *was* active (dockTree.ts removePanel's `node.active !== id` branch) — a
// non-active tab's ✕ must leave the leaf's active tab untouched.
//
// R4 (height-strip collapse): the code leaf (`l4`, root split `dir:"col"`)
// collapses to a `COLLAPSED_STRIP_PX`(34) *height* strip, not a width rail
// (`collapsesToRail` only fires under a `dir:"row"` parent — dockLayoutModel.ts)
// — and `splitChildFlex`'s `showDivider:false` means the owning split's own
// divider stops rendering while the *other* two splitters in the tree are
// unaffected. Reuses m1-dock-header-collapse.spec.ts's `elementFromPoint`
// hit-test pattern (real pointer coordinates, no `.click()` auto-scroll/force
// shortcuts) against a *height*-collapsed leaf instead of a width-collapsed
// one.
//
// R7 (divider clamp): `clampDividerRatio` (dockTree.ts) enforces
// `MIN_LEAF_WIDTH`(240)/`MIN_LEAF_HEIGHT`(160) regardless of how far past
// them the pointer drags — both a lower bound (the clamp held) and an upper
// bound (the drag actually moved the divider, proving the lower bound isn't
// just the untouched default) are asserted per axis.
//
// R8 (tab overflow mask): `DockPanelHeader.tsx`'s `leaf.tabs.length > 3`
// branch adds `.dock-header-tabs--masked` and `.dock-header-tabs` itself
// scrolls (`overflow-x: auto`) rather than growing the 34px header taller —
// uses B7-U2's `setDockTree` fixture to force a real 4-tab leaf into a narrow
// slot instead of driving 3-4 real drags to get there.
//
// Structure mirrors m2-dock-drag.spec.ts/m4-dock-dragdrop.spec.ts: serial,
// real page.mouse coordinates, page.goto("/") + bootApp(page) per test (fresh
// context ⇒ isolated state, no cross-test bleed). Existing m1-m4 dock specs
// are untouched.
test.describe("M5 — dock header chrome: close semantics, collapse strip, divider clamp, tab overflow", () => {
  test("R6: header ✕ closes the whole panel, tab ✕ closes only that tab without activating it", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );

    // Header ✕ on the sidePanel leaf (inspector+assets) closes both tabs at
    // once — `closePanel(path)` removes every tab on the leaf, not just the
    // active one.
    await page
      .locator(".shell-right-bottom")
      .getByRole("button", { name: "Close panel" })
      .click();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "3 panels docked",
    );
    await expect(page.getByTestId("tab-inspector")).toHaveCount(0);
    await expect(page.getByTestId("tab-assets")).toHaveCount(0);

    await page.getByTestId("dock-reset-layout").click();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "5 panels docked",
    );

    // The default tree's l3 leaf (inspector+assets) has `active: "inspector"`
    // (dockTree.createDefaultDockTree) — closing the *inactive* assets tab
    // via its own ✕ must remove only that tab, leaving inspector active
    // (R6: a non-active tab's ✕ never forces activation).
    await page.getByTestId("tab-assets").locator(".panel-tab-close").click();
    await expect(page.getByTestId("status-docked")).toHaveText(
      "4 panels docked",
    );
    await expect(page.getByTestId("tab-assets")).toHaveCount(0);
    await expect(page.getByTestId("tab-inspector")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("R4: code leaf collapses to a 34px height strip, its divider disappears, restore works with a real pointer", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    // Default tree: 1 row split (nodeEditor | rest) + 1 col split
    // (viewport | sidePanel) + 1 root col split (top area | code) = 3
    // dividers.
    await expect(page.locator("hr.splitter")).toHaveCount(3);

    const shellCode = page.locator(".shell-code");
    await shellCode.getByRole("button", { name: "Collapse panel" }).click();

    const collapsedBox = await shellCode.boundingBox();
    if (!collapsedBox) {
      throw new Error(".shell-code has no bounding box after collapse");
    }
    // COLLAPSED_STRIP_PX(34) + border/rounding slack, well short of the
    // panel's normal (~250px) height.
    expect(collapsedBox.height).toBeLessThan(60);

    // splitChildFlex's showDivider:false for the collapsed split — the root
    // split's own divider stops rendering, the other two are untouched.
    await expect(page.locator("hr.splitter")).toHaveCount(2);

    const restoreBtn = shellCode.getByRole("button", { name: "Expand panel" });
    const restoreBox = await restoreBtn.boundingBox();
    if (!restoreBox) throw new Error("restore button has no bounding box");

    // The button's real screen center must sit inside the collapsed strip's
    // vertical span — not overflowed past it (mirrors
    // m1-dock-header-collapse.spec.ts's horizontal-axis check for the
    // width-collapsed nodeEditor rail; this leaf collapses on the *height*
    // axis instead, so the check is on y).
    const cx = restoreBox.x + restoreBox.width / 2;
    const cy = restoreBox.y + restoreBox.height / 2;
    expect(cy).toBeGreaterThanOrEqual(collapsedBox.y);
    expect(cy).toBeLessThanOrEqual(collapsedBox.y + collapsedBox.height);

    // Real hit-test at the button's actual on-screen position — no
    // `.click()`'s scrollIntoView/force shortcuts, reproducing m1's
    // elementFromPoint pattern so a real pointer (not a locator's
    // actionability escape hatch) is proven to reach the button.
    const hitLabel = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.getAttribute("aria-label") ?? null,
      { x: cx, y: cy },
    );
    expect(hitLabel).toBe("Expand panel");

    // Real mouse click at those exact coordinates — no `.click({force})`,
    // no `scrollIntoViewIfNeeded()`.
    await page.mouse.click(cx, cy);

    const restoredBox = await shellCode.boundingBox();
    if (!restoredBox) {
      throw new Error(".shell-code has no bounding box after restore");
    }
    expect(restoredBox.height).toBeGreaterThan(100);
    await expect(page.locator("hr.splitter")).toHaveCount(3);
  });

  test("R7: divider drag clamps at the 240×160 leaf minimum", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const dockRoot = page.locator(".dock-root");
    const rootBox = await dockRoot.boundingBox();
    if (!rootBox) throw new Error(".dock-root has no bounding box");

    // The row split (nodeEditor | viewport+sidePanel column) is the only
    // vertical (col-resize) splitter in the default tree.
    const vertical = page.locator("hr.splitter--vertical");
    await expect(vertical).toHaveCount(1);
    const vBox = await vertical.boundingBox();
    if (!vBox) throw new Error("vertical splitter has no bounding box");
    const vCy = vBox.y + vBox.height / 2;

    await page.mouse.move(vBox.x + vBox.width / 2, vCy);
    await page.mouse.down();
    // Splitter.tsx's handlePointerDown calls setPointerCapture — page.mouse's
    // subsequent pointermove events retarget to that captured element
    // regardless of the on-screen path, so this stays real-pointer semantics
    // (not a synthetic dispatch) even though the destination is far left.
    await page.mouse.move(rootBox.x + 60, vCy, { steps: 12 });
    await page.mouse.up();

    const shellLeftBox = await page.locator(".shell-left").boundingBox();
    if (!shellLeftBox) throw new Error(".shell-left has no bounding box");
    // Lower bound proves the MIN_LEAF_WIDTH(240) clamp held; upper bound
    // proves the drag actually moved the divider from its unclamped ~840px
    // default (0.587 ratio of the shell width) — not just an untouched
    // starting position that happens to be outside [238,300].
    expect(shellLeftBox.width).toBeGreaterThanOrEqual(238);
    expect(shellLeftBox.width).toBeLessThanOrEqual(300);

    // The root split's horizontal (row-resize) splitter — its accessible
    // name is derived by dockLayoutModel.splitterLabel from the default
    // tree's shape, so select it that way rather than by position.
    const horizontal = page.getByRole("separator", {
      name: "Resize Node Editor and Viewport and Inspector / Assets and Code",
    });
    const hBox = await horizontal.boundingBox();
    if (!hBox) throw new Error("root horizontal splitter has no bounding box");
    const hCx = hBox.x + hBox.width / 2;

    await page.mouse.move(hCx, hBox.y + hBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hCx, rootBox.y + rootBox.height - 20, {
      steps: 12,
    });
    await page.mouse.up();

    const shellCodeBox = await page.locator(".shell-code").boundingBox();
    if (!shellCodeBox) throw new Error(".shell-code has no bounding box");
    // Lower bound: MIN_LEAF_HEIGHT(160) clamp held. Upper bound: the drag
    // actually shrank the code panel from its unclamped ~250px default.
    expect(shellCodeBox.height).toBeGreaterThanOrEqual(158);
    expect(shellCodeBox.height).toBeLessThanOrEqual(240);
  });

  test("R8: a 4-tab leaf in a narrow slot keeps the 34px header and gains the fade mask", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    // ratio 0.18 against the ~1434px dock-root width puts leaf `x1` at
    // ~258px — narrow enough that its 4 tabs actually overflow. `x1` carries
    // inspector+assets so legacyLeafClass maps it to "shell-right-bottom"
    // (dockLayoutModel.leafPanelKind's sidePanel branch).
    await setDockTree(
      page,
      {
        type: "split",
        dir: "row",
        ratio: 0.18,
        a: {
          type: "leaf",
          id: "x1",
          tabs: ["viewport", "inspector", "code", "assets"],
          active: "inspector",
        },
        b: {
          type: "leaf",
          id: "x2",
          tabs: ["nodeEditor"],
          active: "nodeEditor",
        },
      },
      20,
    );

    const narrow = page.locator(".shell-right-bottom");
    // R8: >3 tabs is the mask threshold (DockPanelHeader.tsx's
    // `leaf.tabs.length > 3` branch).
    await expect(narrow.locator(".dock-header-tabs--masked")).toHaveCount(1);

    // The header itself stays a fixed 34px strip regardless of the tab
    // overflow — it never grows to accommodate the extra tabs.
    const headerBox = await narrow.locator(".dock-header").boundingBox();
    if (!headerBox) throw new Error(".dock-header has no bounding box");
    expect(headerBox.height).toBeGreaterThanOrEqual(34);
    expect(headerBox.height).toBeLessThanOrEqual(36);

    // Prove the overflow is real (not just the mask class present without an
    // actual scrollable overflow) — `.dock-header-tabs` has `overflow-x:
    // auto` (index.css), so a genuinely too-narrow tab row scrolls.
    const overflowing = await narrow
      .locator(".dock-header-tabs")
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflowing).toBe(true);

    // All 4 tabs are still mounted in the DOM — the mask/scroll hides them
    // visually, it never drops them.
    await expect(page.getByTestId("tab-viewport")).toHaveCount(1);
    await expect(page.getByTestId("tab-inspector")).toHaveCount(1);
    await expect(page.getByTestId("tab-code")).toHaveCount(1);
    await expect(page.getByTestId("tab-assets")).toHaveCount(1);
  });
});
