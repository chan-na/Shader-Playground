import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

// M1-U2/v2.0 regression guard: `.shell-code` (Code) is the one docked slot
// that App.tsx collapses to a 34px *width* strip instead of a 34px *height*
// strip. `collapsesToRail` (dockLayoutModel.ts) derives this from the tree —
// it fires whenever a leaf's immediate parent split runs `dir:"row"` — and in
// the v2.0 default tree (`row 0.25 [ code | row 0.6 [ nodeEditor | col 0.52
// [viewport / (inspector,assets)] ] ]`) that leaf is Code, the root row's `a`
// (left) child. Pre-v2.0 it was Node Editor; the rail mechanism itself is
// unchanged (V2 — zero new branches were needed to move it, only this
// spec's retarget from `.shell-left` to `.shell-code`). A prior
// implementation left the dock header laid out as a horizontal row in that
// state, which pushed the restore (⌃) button past the 34px strip where the
// panel's `overflow: hidden` clipped it — the button was still in the DOM (so
// a `.click()` with auto-scroll/force could "succeed"), but a real pointer at
// its own on-screen position could never reach it, permanently trapping the
// panel collapsed until a reload.
//
// This spec deliberately avoids `.click()`'s built-in scrollIntoView/
// actionability shortcuts: it hit-tests the button's real screen coordinates
// via `elementFromPoint` and restores it with `page.mouse.click(x, y)`, the
// same way an actual user's pointer would.
test.describe("M1-U2 — Code dock header stays reachable when width-collapsed", () => {
  test("restore button sits inside the collapsed strip and responds to a real mouse click", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const shellCode = page.locator(".shell-code");
    const expandedBox = await shellCode.boundingBox();
    if (!expandedBox) throw new Error("shell-code has no bounding box");
    expect(expandedBox.width).toBeGreaterThan(100);

    // Collapse via the header's own button — still full-width at this
    // point, so a normal locator click is fine here.
    await shellCode.getByRole("button", { name: "Collapse panel" }).click();

    const collapsedBox = await shellCode.boundingBox();
    if (!collapsedBox) {
      throw new Error("shell-code has no bounding box after collapse");
    }
    expect(collapsedBox.width).toBeLessThan(60);

    // v2.1 X17-b: the width-collapsed rail now renders its vertical identity
    // label — additive guard only, the width/hit-test assertions above are
    // the mechanism contract and stay untouched.
    await expect(shellCode.getByTestId("dock-rail-label")).toBeVisible();

    const restoreBtn = shellCode.getByRole("button", { name: "Expand panel" });
    const restoreBox = await restoreBtn.boundingBox();
    if (!restoreBox) throw new Error("restore button has no bounding box");

    // The button's real screen center must sit inside the collapsed strip —
    // not overflowed past it — and elementFromPoint at that exact position
    // must resolve back to the button itself, not a clipped-away node that
    // a real pointer could never hit.
    const cx = restoreBox.x + restoreBox.width / 2;
    const cy = restoreBox.y + restoreBox.height / 2;
    expect(cx).toBeGreaterThanOrEqual(collapsedBox.x);
    expect(cx).toBeLessThanOrEqual(collapsedBox.x + collapsedBox.width);

    const hitLabel = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.getAttribute("aria-label") ?? null,
      { x: cx, y: cy },
    );
    expect(hitLabel).toBe("Expand panel");

    // Real mouse click at those exact coordinates — no `.click({force})`,
    // no `scrollIntoViewIfNeeded()` — reproducing an actual user's pointer.
    await page.mouse.click(cx, cy);

    const restoredBox = await shellCode.boundingBox();
    if (!restoredBox) {
      throw new Error("shell-code has no bounding box after restore");
    }
    expect(restoredBox.width).toBeGreaterThan(100);
    await expect(
      shellCode.getByRole("button", { name: "Collapse panel" }),
    ).toBeVisible();
  });
});
