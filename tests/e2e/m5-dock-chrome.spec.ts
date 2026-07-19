import { expect, test } from "@playwright/test";
import { bootApp, setDockTree } from "./helpers/fixtures";

// M5/B7-U4 regression guard, retargeted for v2.0's breaking layout
// (design/App Shell.dc.html SSoT + design/CHANGELOG.md §v2.0): four
// dock-header/divider behaviors that never got an end-to-end exercise of
// their own.
//
// v2.0 default tree (dockTree.createDefaultDockTree, 1440×900 viewport,
// `.dock-root` ≈1434×820):
//   row 0.25 [ code | row 0.60 [ nodeEditor | col 0.52 [viewport / (inspector,assets)] ] ]
// — left column Code (`l4`, ≈357px/25%, collapsible) · center Node Editor
// (`l3`, ≈639px) · right column split col 0.52 into Viewport (`l1`, ≈423px
// tall) over Inspector/Assets (`l2`, ≈391px tall, ≈426px wide). Three
// dividers total: the root row split (code | rest) and the inner row split
// (nodeEditor | right column) are both **vertical** (col-resize, dragged on
// the x axis — `Splitter`'s `orientation: node.dir === "row" ? "vertical" :
// "horizontal"`), and the col split (viewport / sidePanel) is the sole
// **horizontal** one.
//
// R6 (header ✕ vs tab ✕): `dockStore.closePanel(path)` (header ✕,
// DockPanelHeader.tsx's `.dock-header-btn--close`) removes every tab on the
// leaf, while `dockStore.closeTab(id)` (a single tab's own `.panel-tab-close`
// ✕) removes just that one tab and only reassigns `active` if the closed tab
// *was* active (dockTree.ts removePanel's `node.active !== id` branch) — a
// non-active tab's ✕ must leave the leaf's active tab untouched.
//
// R4 (width-strip collapse, v2.0-breaking): in the v2.0 tree the code leaf
// (`l4`) is the root row split's `a` (left) child, so it collapses to a
// `COLLAPSED_STRIP_PX`(34) **width** rail, not a height strip
// (`collapsesToRail` only fires under a `dir:"row"` parent —
// dockLayoutModel.ts; pre-v2.0 this leaf collapsed on the height axis
// instead). `splitChildFlex`'s `showDivider:false` means the *root* split's
// own divider stops rendering while the other two splitters (the inner row
// split and the col split) are unaffected — so collapsing code takes the
// splitter count from 3 (2 vertical + 1 horizontal) down to 2 (1 vertical + 1
// horizontal), not 3→2 with the vertical count untouched as it would if a
// height-collapsing leaf were involved. Reuses
// m1-dock-header-collapse.spec.ts's `elementFromPoint` hit-test pattern
// (real pointer coordinates, no `.click()` auto-scroll/force shortcuts)
// against this width-collapsed leaf, checking the *x* axis instead of *y*.
//
// R7 (divider clamp, v2.0-breaking — now a 3-axis clamp): `clampDividerRatio`
// (dockTree.ts) enforces `MIN_LEAF_WIDTH`(240)/`MIN_LEAF_HEIGHT`(160)
// regardless of how far past them the pointer drags. v2.0 has *two*
// independent vertical splitters (root row + inner row) where pre-v2.0 had
// one, so this test now clamps three axes instead of two: the root splitter
// against Code's width, the inner splitter against Node Editor's width, and
// the col splitter (unchanged in kind, but re-measured against v2.0's
// geometry) against the Inspector/Assets leaf's height. Each clamp asserts
// both a lower bound (the clamp held) and an upper bound (the drag actually
// moved the divider, proving the lower bound isn't just the untouched
// default).
//
// R8 (tab overflow mask): `DockPanelHeader.tsx`'s `leaf.tabs.length > 3`
// branch adds `.dock-header-tabs--masked` and `.dock-header-tabs` itself
// scrolls (`overflow-x: auto`) rather than growing the 34px header taller —
// uses B7-U2's `setDockTree` fixture to force a real 4-tab leaf into a narrow
// slot instead of driving 3-4 real drags to get there. Unaffected by v2.0
// (custom tree, position-independent kind mapping) — left unchanged.
//
// Structure mirrors m2-dock-drag.spec.ts/m4-dock-dragdrop.spec.ts: serial,
// real page.mouse coordinates, page.goto("/") + bootApp(page) per test (fresh
// context ⇒ isolated state, no cross-test bleed). Existing m1-m4 dock specs
// are untouched (m1's `.shell-code` retarget is a separate, soft change).
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

    // The default tree's l2 leaf (inspector+assets) has `active: "inspector"`
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

  test("R4: code leaf collapses to a 34px width rail, its root divider disappears, restore works with a real pointer", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    // v2.0 default tree: root row split (code | rest) + inner row split
    // (nodeEditor | right column) + col split (viewport | sidePanel) = 3
    // dividers, 2 of them vertical (the two row splits).
    await expect(page.locator("hr.splitter")).toHaveCount(3);
    await expect(page.locator("hr.splitter--vertical")).toHaveCount(2);

    const shellCode = page.locator(".shell-code");
    await shellCode.getByRole("button", { name: "Collapse panel" }).click();

    const collapsedBox = await shellCode.boundingBox();
    if (!collapsedBox) {
      throw new Error(".shell-code has no bounding box after collapse");
    }
    // COLLAPSED_STRIP_PX(34) + border/rounding slack, well short of the
    // panel's normal (~357px) width. v2.0: the code leaf is the root row
    // split's left child, so it collapses on the *width* axis, not height.
    expect(collapsedBox.width).toBeLessThan(60);

    // splitChildFlex's collapsed branch must give the opposite subtree
    // grow=1 (fills *all* freed space), not `1-ratio` (grow=0.75, which
    // would leave ~25% of the freed width — ~350px at this viewport — as
    // a blank strip between the right column and the shell's own right
    // edge). Assert the right column's right edge actually reaches
    // `.dock-root`'s right edge with the code rail collapsed.
    const dockRootBox = await page.locator(".dock-root").boundingBox();
    if (!dockRootBox) throw new Error(".dock-root has no bounding box");
    const rightTopBox = await page.locator(".shell-right-top").boundingBox();
    if (!rightTopBox) {
      throw new Error(".shell-right-top has no bounding box");
    }
    expect(rightTopBox.x + rightTopBox.width).toBeGreaterThanOrEqual(
      dockRootBox.x + dockRootBox.width - 2,
    );

    // splitChildFlex's showDivider:false for the collapsed split — the
    // *root* row split's own divider stops rendering, the inner row split
    // and the col split are untouched (3 → 2 total, 2 → 1 vertical).
    await expect(page.locator("hr.splitter")).toHaveCount(2);
    await expect(page.locator("hr.splitter--vertical")).toHaveCount(1);

    const restoreBtn = shellCode.getByRole("button", { name: "Expand panel" });
    const restoreBox = await restoreBtn.boundingBox();
    if (!restoreBox) throw new Error("restore button has no bounding box");

    // The button's real screen center must sit inside the collapsed strip's
    // horizontal span — not overflowed past it (mirrors
    // m1-dock-header-collapse.spec.ts's own width-collapsed check, since both
    // specs now exercise the same rail mechanism on the same leaf kind's
    // physical position class — the check is on x, not y, because this leaf
    // collapses on the *width* axis).
    const cx = restoreBox.x + restoreBox.width / 2;
    const cy = restoreBox.y + restoreBox.height / 2;
    expect(cx).toBeGreaterThanOrEqual(collapsedBox.x);
    expect(cx).toBeLessThanOrEqual(collapsedBox.x + collapsedBox.width);

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
    expect(restoredBox.width).toBeGreaterThan(100);
    await expect(page.locator("hr.splitter")).toHaveCount(3);
  });

  test("R7: root/inner/col divider drags each clamp at the 240×160 leaf minimum", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const dockRoot = page.locator(".dock-root");
    const rootBox = await dockRoot.boundingBox();
    if (!rootBox) throw new Error(".dock-root has no bounding box");

    // (a) v2.0 default geometry, undragged: Code is ~25% of the shell width
    // (root split ratio 0.25) and Node Editor (the center column) is wider
    // than the entire right-hand column (Viewport/Inspector/Assets combined)
    // — the v2.0 redesign's "node graph promoted to the large central
    // column" (CHANGELOG §v2.0 V3).
    const shellCodeBox0 = await page.locator(".shell-code").boundingBox();
    const nodeEditorBox0 = await page.locator(".shell-left").boundingBox();
    const viewportBox0 = await page.locator(".shell-right-top").boundingBox();
    if (!shellCodeBox0 || !nodeEditorBox0 || !viewportBox0) {
      throw new Error("shell-code/shell-left/shell-right-top missing box");
    }
    const codeRatio = shellCodeBox0.width / rootBox.width;
    expect(codeRatio).toBeGreaterThanOrEqual(0.22);
    expect(codeRatio).toBeLessThanOrEqual(0.28);
    // shell-right-top spans the full width of the right column (the col
    // split only divides it vertically from sidePanel), so its width doubles
    // as the right column's width for this comparison.
    expect(nodeEditorBox0.width).toBeGreaterThan(viewportBox0.width);

    // (b) Root row splitter (exact accessible name — its label is a prefix
    // of no other splitter's, but the reverse doesn't hold, so `exact: true`
    // is required either way) dragged far left: Code shrinks toward
    // MIN_LEAF_WIDTH(240), replacing the pre-v2.0 "code height clamp" case
    // (this is its v2.0 counterpart — the same 240×160 clamp, now on the
    // width axis because Code moved to a row-split leaf).
    const rootSplitter = page.getByRole("separator", {
      name: "Resize Code and Node Editor and Viewport and Inspector / Assets",
      exact: true,
    });
    const rBox0 = await rootSplitter.boundingBox();
    if (!rBox0) throw new Error("root splitter has no bounding box");
    const rCy = rBox0.y + rBox0.height / 2;
    await page.mouse.move(rBox0.x + rBox0.width / 2, rCy);
    await page.mouse.down();
    // Splitter.tsx's handlePointerDown calls setPointerCapture — page.mouse's
    // subsequent pointermove events retarget to that captured element
    // regardless of the on-screen path, so this stays real-pointer semantics
    // (not a synthetic dispatch) even though the destination is far left.
    await page.mouse.move(rootBox.x + 60, rCy, { steps: 12 });
    await page.mouse.up();

    const shellCodeBox1 = await page.locator(".shell-code").boundingBox();
    if (!shellCodeBox1) throw new Error(".shell-code has no bounding box");
    // Lower bound proves the MIN_LEAF_WIDTH(240) clamp held; upper bound
    // proves the drag actually moved the divider from its unclamped ~357px
    // default (0.25 ratio of the shell width) — not just an untouched
    // starting position that happens to be outside [238,300].
    expect(shellCodeBox1.width).toBeGreaterThanOrEqual(238);
    expect(shellCodeBox1.width).toBeLessThanOrEqual(300);

    // (c) Inner row splitter (nodeEditor | right column), also dragged far
    // left: Node Editor shrinks toward MIN_LEAF_WIDTH(240) from its ~639px
    // default. This is the divider v2.0 adds on top of the pre-v2.0 single
    // vertical splitter — its own independent clamp.
    const innerSplitter = page.getByRole("separator", {
      name: "Resize Node Editor and Viewport and Inspector / Assets",
      exact: true,
    });
    const iBox0 = await innerSplitter.boundingBox();
    if (!iBox0) throw new Error("inner splitter has no bounding box");
    const iCy = iBox0.y + iBox0.height / 2;
    await page.mouse.move(iBox0.x + iBox0.width / 2, iCy);
    await page.mouse.down();
    await page.mouse.move(rootBox.x + 60, iCy, { steps: 12 });
    await page.mouse.up();

    const shellLeftBox = await page.locator(".shell-left").boundingBox();
    if (!shellLeftBox) throw new Error(".shell-left has no bounding box");
    expect(shellLeftBox.width).toBeGreaterThanOrEqual(238);
    expect(shellLeftBox.width).toBeLessThanOrEqual(300);

    // (d) Col splitter (viewport / sidePanel, the sole horizontal one):
    // dragged to the bottom of the shell, shrinking the Inspector/Assets
    // leaf's height toward MIN_LEAF_HEIGHT(160) from its ~391px default.
    const colSplitter = page.getByRole("separator", {
      name: "Resize Viewport and Inspector / Assets",
      exact: true,
    });
    const cBox0 = await colSplitter.boundingBox();
    if (!cBox0) throw new Error("col splitter has no bounding box");
    const cCx = cBox0.x + cBox0.width / 2;
    await page.mouse.move(cCx, cBox0.y + cBox0.height / 2);
    await page.mouse.down();
    await page.mouse.move(cCx, rootBox.y + rootBox.height - 20, {
      steps: 12,
    });
    await page.mouse.up();

    const shellRightBottomBox = await page
      .locator(".shell-right-bottom")
      .boundingBox();
    if (!shellRightBottomBox) {
      throw new Error(".shell-right-bottom has no bounding box");
    }
    // Lower bound: MIN_LEAF_HEIGHT(160) clamp held. Upper bound: the drag
    // actually shrank the sidePanel leaf from its unclamped ~391px default.
    expect(shellRightBottomBox.height).toBeGreaterThanOrEqual(158);
    expect(shellRightBottomBox.height).toBeLessThanOrEqual(240);
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
