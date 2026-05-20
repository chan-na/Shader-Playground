import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Phase 23 — multi-selection editing. selectionStore already holds a set of
// ids; this phase wires the remaining single-select assumptions:
//   - arrow keys nudge the whole selection together (KeyboardShortcuts; falls
//     back to React Flow's native move when a node has keyboard focus),
//   - Cmd/Ctrl+A selects every node,
//   - the Inspector shows a "N nodes selected" banner so it is clear the
//     editing controls below act on the primary (last-selected) node only.

const LAYOUT = {
  m1: { x: 0, y: 0 },
  s1: { x: 200, y: 0 },
  o1: { x: 400, y: 0 },
};

async function blurActive(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
}

test.describe("Phase 23 — multi-selection editing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("arrow keys move the whole selection together, leaving others put", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), LAYOUT);
    await withSp(
      page,
      (sp) => sp.selection.getState().setSelectedIds(["m1", "s1"]),
      null,
    );
    await blurActive(page);

    const before = await readSp(page, (sp) => sp.graph.getState().positions);

    await page.keyboard.press("ArrowRight");

    // Either our handler (10px) or React Flow's native move runs; assert the
    // direction and that the selected pair moved together, not the exact step.
    await expect
      .poll(() => readSp(page, (sp) => sp.graph.getState().positions.m1.x))
      .toBeGreaterThan(before.m1.x);

    const after = await readSp(page, (sp) => sp.graph.getState().positions);
    expect(after.s1.x).toBeGreaterThan(before.s1.x);
    // Same horizontal delta for both selected nodes.
    expect(after.m1.x - before.m1.x).toBeCloseTo(after.s1.x - before.s1.x, 5);
    // Vertical untouched for a horizontal arrow.
    expect(after.m1.y).toBe(before.m1.y);
    // The unselected output node stays exactly where it was.
    expect(after.o1).toEqual(before.o1);
  });

  test("arrow keys with an empty selection do not move any node", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), LAYOUT);
    await withSp(page, (sp) => sp.selection.getState().select(null), null);
    await blurActive(page);

    const before = await readSp(page, (sp) => sp.graph.getState().positions);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    const after = await readSp(page, (sp) => sp.graph.getState().positions);
    expect(after).toEqual(before);
  });

  test("Cmd/Ctrl+A selects every node", async ({ page }) => {
    await setGraph(page, trivialMeshGraph(), LAYOUT);
    await withSp(page, (sp) => sp.selection.getState().select(null), null);
    await blurActive(page);

    await page.keyboard.press("Meta+a");

    await expect
      .poll(() =>
        readSp(page, (sp) => sp.selection.getState().selectedNodeIds.length),
      )
      .toBe(3);
    const ids = await readSp(page, (sp) =>
      [...sp.selection.getState().selectedNodeIds].sort(),
    );
    expect(ids).toEqual(["m1", "o1", "s1"]);
  });

  test("Inspector shows a multi-select banner when more than one node is selected", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), LAYOUT);
    await page.getByTestId("tab-inspector").click();

    // Single selection → no banner.
    await withSp(page, (sp) => sp.selection.getState().select("s1"), null);
    await expect(page.getByTestId("multi-select-banner")).toHaveCount(0);

    // Multi selection → banner appears and names the count + primary.
    await withSp(
      page,
      (sp) => sp.selection.getState().setSelectedIds(["m1", "s1"]),
      null,
    );
    const banner = page.getByTestId("multi-select-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("2 nodes selected");
    // Primary is the last id added to the set.
    await expect(banner).toContainText("s1");
  });
});
