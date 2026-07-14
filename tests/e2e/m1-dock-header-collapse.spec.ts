import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

// M1-U2 regression guard: shell-left (Node Editor) is the one docked slot
// that App.tsx collapses to a 34px *width* strip instead of a 34px *height*
// strip. A prior implementation left the dock header laid out as a
// horizontal row in that state, which pushed the restore (⌃) button past
// the 34px strip where the panel's `overflow: hidden` clipped it — the
// button was still in the DOM (so a `.click()` with auto-scroll/force could
// "succeed"), but a real pointer at its own on-screen position could never
// reach it, permanently trapping the panel collapsed until a reload.
//
// This spec deliberately avoids `.click()`'s built-in scrollIntoView/
// actionability shortcuts: it hit-tests the button's real screen coordinates
// via `elementFromPoint` and restores it with `page.mouse.click(x, y)`, the
// same way an actual user's pointer would.
test.describe("M1-U2 — Node Editor dock header stays reachable when width-collapsed", () => {
  test("restore button sits inside the collapsed strip and responds to a real mouse click", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const shellLeft = page.locator(".shell-left");
    const expandedBox = await shellLeft.boundingBox();
    if (!expandedBox) throw new Error("shell-left has no bounding box");
    expect(expandedBox.width).toBeGreaterThan(100);

    // Collapse via the header's own button — still full-width at this
    // point, so a normal locator click is fine here.
    await shellLeft.getByRole("button", { name: "Collapse panel" }).click();

    const collapsedBox = await shellLeft.boundingBox();
    if (!collapsedBox) {
      throw new Error("shell-left has no bounding box after collapse");
    }
    expect(collapsedBox.width).toBeLessThan(60);

    const restoreBtn = shellLeft.getByRole("button", { name: "Expand panel" });
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

    const restoredBox = await shellLeft.boundingBox();
    if (!restoredBox) {
      throw new Error("shell-left has no bounding box after restore");
    }
    expect(restoredBox.width).toBeGreaterThan(100);
    await expect(
      shellLeft.getByRole("button", { name: "Collapse panel" }),
    ).toBeVisible();
  });
});
