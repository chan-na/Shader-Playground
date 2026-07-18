import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";

// M2/B4-U4 regression guard: the pointerdown wiring added in this unit
// (grab handle → startLeafDrag, tab → startTabDrag) actually drives the
// drag engine that B4-U3 built — pending → 4px-threshold ghost → drop
// preview → release-time (re)dock, per `Docking Prototype.dc.html`
// `onMove`/`onUp` (L385-440) and R1 ("no floating panels — every release
// force-docks somewhere").
test.describe("M2 — dock drag start (grab/tab pointerdown → re-dock)", () => {
  test("tab drag splits a region: dragging the Assets tab to the left band docks it into a new left leaf", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const assetsTab = page.getByTestId("tab-assets");
    const startBox = await assetsTab.boundingBox();
    if (startBox === null) throw new Error("tab-assets has no bounding box");
    const startCx = startBox.x + startBox.width / 2;
    const startCy = startBox.y + startBox.height / 2;

    const dockRoot = page.locator(".dock-root");
    const rootBox = await dockRoot.boundingBox();
    if (rootBox === null) throw new Error(".dock-root has no bounding box");
    // Left outer drop band is `x < 42` relative to .dock-root — x≈10 is
    // well inside it. y = shell vertical center.
    const targetX = rootBox.x + 10;
    const targetY = rootBox.y + rootBox.height / 2;

    await page.mouse.move(startCx, startCy);
    await page.mouse.down();
    // >4px threshold on the first sub-step converts pending → ghost; the
    // remaining sub-steps update the ghost position and recompute the drop
    // target, landing on "Dock left" by the final step.
    await page.mouse.move(targetX, targetY, { steps: 8 });

    const preview = page.locator(".dock-drop-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Dock left");

    await page.mouse.up();

    // No lingering drag ghost after release (R1 — never left mid-drag).
    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );

    const endedTab = page.getByTestId("tab-assets");
    await expect(endedTab).toBeVisible();
    const endBox = await endedTab.boundingBox();
    if (endBox === null) {
      throw new Error("tab-assets has no bounding box after drop");
    }
    // Re-docked into a brand-new leaf on the left edge of the shell — its
    // on-screen x must have moved left of where it started.
    expect(endBox.x).toBeLessThan(startBox.x);
  });

  test("release outside any target force-docks — no floating/vanished panel", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const inspectorTab = page.getByTestId("tab-inspector");
    const startBox = await inspectorTab.boundingBox();
    if (startBox === null) {
      throw new Error("tab-inspector has no bounding box");
    }
    const startCx = startBox.x + startBox.width / 2;
    const startCy = startBox.y + startBox.height / 2;

    const dockRoot = page.locator(".dock-root");
    const rootBox = await dockRoot.boundingBox();
    if (rootBox === null) throw new Error(".dock-root has no bounding box");
    // Release above the shell content, inside the toolbar band — outside
    // every dock region and off the tree entirely. `onUp`'s
    // `dropTarget || fallbackDropTarget(...)` (R1) must still dock it
    // somewhere rather than leaving it as a stray floating ghost.
    const releaseX = rootBox.x + rootBox.width / 2;
    const releaseY = Math.max(0, rootBox.y - 20);

    await page.mouse.move(startCx, startCy);
    await page.mouse.down();
    await page.mouse.move(releaseX, releaseY, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('[data-testid="dock-drag-ghost"]')).toHaveCount(
      0,
    );
    // The tab survives the release — still present and mounted somewhere
    // in the tree, never floating or lost.
    await expect(page.getByTestId("tab-inspector")).toBeVisible();
  });
});
