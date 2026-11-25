import { expect, test } from "@playwright/test";
import { boxOf } from "./helpers/dom";
import { bootApp, setDockTree } from "./helpers/fixtures";

// Phase 35 — dock header/divider chrome: header ✕ vs tab ✕ close semantics,
// the Code leaf's width-collapsed rail, divider clamping, and tab overflow.
// Default tree and geometry: `src/ui/dock/tree.ts` `createDefaultDockTree`
// (Code | Node Editor | Viewport over Inspector/Assets); layout rules in
// `src/ui/dock/dockLayoutModel.ts` (`collapsesToRail`, `splitChildFlex`) and
// `src/ui/dock/geometry.ts` (`clampDividerRatio`). Every test boots a fresh
// page.
test.describe("Phase 35 — dock header chrome: close semantics, collapse rail, divider clamp, tab overflow", () => {
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

    // The default inspector+assets leaf has `active: "inspector"` — closing
    // the *inactive* assets tab via its own ✕ must remove only that tab,
    // leaving inspector active (a non-active tab's ✕ never forces
    // activation; see tree.ts removePanel).
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

  // The Code leaf is the root row split's left child, so `collapsesToRail`
  // folds it to a 34px *width* rail. A past implementation left the header
  // laid out as a horizontal row in that state, pushing the restore button
  // past the strip where `overflow: hidden` clipped it — still in the DOM (so
  // a locator `.click()` could "succeed") but unreachable by a real pointer.
  // The restore step therefore hit-tests with `elementFromPoint` and clicks
  // with `page.mouse` at the button's real on-screen centre.
  test("R4: code leaf collapses to a 34px width rail, its root divider disappears, restore works with a real pointer", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    // Default tree: root row split (code | rest) + inner row split
    // (nodeEditor | right column) + col split (viewport | sidePanel) = 3
    // dividers, 2 of them vertical (the two row splits).
    await expect(page.locator("hr.splitter")).toHaveCount(3);
    await expect(page.locator("hr.splitter--vertical")).toHaveCount(2);

    const shellCode = page.locator(".shell-code");
    expect((await boxOf(shellCode)).width).toBeGreaterThan(100);

    // Still full-width here, so a normal locator click is fine.
    await shellCode.getByRole("button", { name: "Collapse panel" }).click();

    // COLLAPSED_STRIP_PX(34) + border/rounding slack, well short of the
    // panel's normal (~357px) width.
    const collapsedBox = await boxOf(shellCode);
    expect(collapsedBox.width).toBeLessThan(60);

    // The collapsed rail carries an interior: panel dot + vertical
    // "title · meta" label, plus an error dot on code rails when compile
    // errors exist. A clean boot compiles, so no error dot.
    const railLabel = shellCode.getByTestId("dock-rail-label");
    await expect(railLabel).toBeVisible();
    await expect(railLabel).toContainText("Code");
    await expect(shellCode.getByTestId("dock-rail-error-dot")).toHaveCount(0);

    // splitChildFlex's collapsed branch must give the opposite subtree
    // grow=1 (all freed space), not `1-ratio` (which would leave ~25% of the
    // freed width as a blank strip at the shell's right edge).
    const dockRootBox = await boxOf(page.locator(".dock-root"));
    const rightTopBox = await boxOf(page.locator(".shell-right-top"));
    expect(rightTopBox.x + rightTopBox.width).toBeGreaterThanOrEqual(
      dockRootBox.x + dockRootBox.width - 2,
    );

    // splitChildFlex's showDivider:false — only the *root* split's divider
    // stops rendering (3 → 2 total, 2 → 1 vertical).
    await expect(page.locator("hr.splitter")).toHaveCount(2);
    await expect(page.locator("hr.splitter--vertical")).toHaveCount(1);

    // The restore button's real centre must sit inside the collapsed strip's
    // horizontal span, and elementFromPoint there must resolve back to the
    // button itself — not a clipped-away node a pointer could never hit.
    const restore = await boxOf(
      shellCode.getByRole("button", { name: "Expand panel" }),
    );
    expect(restore.cx).toBeGreaterThanOrEqual(collapsedBox.x);
    expect(restore.cx).toBeLessThanOrEqual(collapsedBox.x + collapsedBox.width);
    const hitLabel = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.getAttribute("aria-label") ?? null,
      { x: restore.cx, y: restore.cy },
    );
    expect(hitLabel).toBe("Expand panel");

    // Real mouse click at those exact coordinates — no `.click({force})`,
    // no `scrollIntoViewIfNeeded()`.
    await page.mouse.click(restore.cx, restore.cy);

    expect((await boxOf(shellCode)).width).toBeGreaterThan(100);
    await expect(page.locator("hr.splitter")).toHaveCount(3);
    await expect(
      shellCode.getByRole("button", { name: "Collapse panel" }),
    ).toBeVisible();

    // The interior is rail-only: expanding the leaf removes it again.
    await expect(shellCode.getByTestId("dock-rail-label")).toHaveCount(0);
  });

  // `clampDividerRatio` enforces MIN_LEAF_WIDTH(240)/MIN_LEAF_HEIGHT(160)
  // however far past them the pointer drags. Each clamp asserts a lower
  // bound (the clamp held) and an upper bound (the drag really moved the
  // divider, so the lower bound isn't just the untouched default).
  test("R7: root/inner/col divider drags each clamp at the 240×160 leaf minimum", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const rootBox = await boxOf(page.locator(".dock-root"));

    // (a) Default geometry, undragged: Code is ~25% of the shell width (root
    // split ratio 0.25) and Node Editor (the centre column) is wider than the
    // whole right-hand column.
    const shellCodeBox0 = await boxOf(page.locator(".shell-code"));
    const nodeEditorBox0 = await boxOf(page.locator(".shell-left"));
    const viewportBox0 = await boxOf(page.locator(".shell-right-top"));
    const codeRatio = shellCodeBox0.width / rootBox.width;
    expect(codeRatio).toBeGreaterThanOrEqual(0.22);
    expect(codeRatio).toBeLessThanOrEqual(0.28);
    // shell-right-top spans the full width of the right column (the col
    // split only divides it vertically), so its width is the column's width.
    expect(nodeEditorBox0.width).toBeGreaterThan(viewportBox0.width);

    // (b) Root row splitter dragged far left: Code shrinks to
    // MIN_LEAF_WIDTH(240). `exact: true` because this label is a superset of
    // the inner splitter's.
    const rBox0 = await boxOf(
      page.getByRole("separator", {
        name: "Resize Code and Node Editor and Viewport and Inspector / Assets",
        exact: true,
      }),
    );
    await page.mouse.move(rBox0.cx, rBox0.cy);
    await page.mouse.down();
    // Splitter.tsx's handlePointerDown calls setPointerCapture, so the moves
    // retarget to the captured splitter whatever the on-screen path — still
    // real-pointer semantics even though the destination is far left.
    await page.mouse.move(rootBox.x + 60, rBox0.cy, { steps: 12 });
    await page.mouse.up();

    const shellCodeBox1 = await boxOf(page.locator(".shell-code"));
    expect(shellCodeBox1.width).toBeGreaterThanOrEqual(238);
    expect(shellCodeBox1.width).toBeLessThanOrEqual(300);

    // (c) Inner row splitter (nodeEditor | right column), also dragged far
    // left: Node Editor shrinks to MIN_LEAF_WIDTH(240) from ~639px.
    const iBox0 = await boxOf(
      page.getByRole("separator", {
        name: "Resize Node Editor and Viewport and Inspector / Assets",
        exact: true,
      }),
    );
    await page.mouse.move(iBox0.cx, iBox0.cy);
    await page.mouse.down();
    await page.mouse.move(rootBox.x + 60, iBox0.cy, { steps: 12 });
    await page.mouse.up();

    const shellLeftBox = await boxOf(page.locator(".shell-left"));
    expect(shellLeftBox.width).toBeGreaterThanOrEqual(238);
    expect(shellLeftBox.width).toBeLessThanOrEqual(300);

    // (d) Col splitter (viewport / sidePanel, the sole horizontal one)
    // dragged to the bottom: the Inspector/Assets leaf shrinks to
    // MIN_LEAF_HEIGHT(160) from ~391px.
    const cBox0 = await boxOf(
      page.getByRole("separator", {
        name: "Resize Viewport and Inspector / Assets",
        exact: true,
      }),
    );
    await page.mouse.move(cBox0.cx, cBox0.cy);
    await page.mouse.down();
    await page.mouse.move(cBox0.cx, rootBox.y + rootBox.height - 20, {
      steps: 12,
    });
    await page.mouse.up();

    const shellRightBottomBox = await boxOf(
      page.locator(".shell-right-bottom"),
    );
    expect(shellRightBottomBox.height).toBeGreaterThanOrEqual(158);
    expect(shellRightBottomBox.height).toBeLessThanOrEqual(240);
  });

  test("R8: a 4-tab leaf in a narrow slot keeps the 34px header and gains the fade mask", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    // ratio 0.18 against the ~1434px dock-root width puts leaf `x1` at
    // ~258px — narrow enough that its 4 tabs overflow. `x1` carries
    // inspector+assets so legacyLeafClass maps it to "shell-right-bottom".
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
    // >3 tabs is the mask threshold (DockPanelHeader.tsx's
    // `leaf.tabs.length > 3` branch).
    await expect(narrow.locator(".dock-header-tabs--masked")).toHaveCount(1);

    // The header stays a fixed 34px strip regardless of the tab overflow.
    const headerBox = await boxOf(narrow.locator(".dock-header"));
    expect(headerBox.height).toBeGreaterThanOrEqual(34);
    expect(headerBox.height).toBeLessThanOrEqual(36);

    // The overflow is real, not just the mask class: `.dock-header-tabs` has
    // `overflow-x: auto`, so a genuinely too-narrow tab row scrolls.
    const overflowing = await narrow
      .locator(".dock-header-tabs")
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflowing).toBe(true);

    // All 4 tabs are still mounted — the mask hides them visually, it never
    // drops them.
    await expect(page.getByTestId("tab-viewport")).toHaveCount(1);
    await expect(page.getByTestId("tab-inspector")).toHaveCount(1);
    await expect(page.getByTestId("tab-code")).toHaveCount(1);
    await expect(page.getByTestId("tab-assets")).toHaveCount(1);
  });
});
