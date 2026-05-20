import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Phase 20 — node duplication. Cmd/Ctrl+D deep-clones the selected node under
// a fresh id (offset position, no edges) and moves the selection onto the
// clone so the Inspector/CodeEditor immediately follow it.

test.describe("Phase 20 — node duplication (Cmd/Ctrl+D)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("Cmd/Ctrl+D clones the selected node and selects the clone", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 0, y: 0 },
      s1: { x: 200, y: 0 },
      o1: { x: 400, y: 0 },
    });

    // Select the shader node, then blur so the keystroke reaches the global
    // window listener instead of an editor.
    await withSp(page, (sp) => sp.selection.getState().select("s1"), null);
    await page.evaluate(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    });

    const before = await readSp(page, (sp) => ({
      count: sp.graph.getState().nodes.length,
      selected: sp.selection.getState().selectedNodeId,
    }));
    expect(before.selected).toBe("s1");

    await page.keyboard.press("Meta+d");

    await expect
      .poll(() => readSp(page, (sp) => sp.graph.getState().nodes.length))
      .toBe(before.count + 1);

    const after = await readSp(page, (sp) => {
      const g = sp.graph.getState();
      const sel = sp.selection.getState().selectedNodeId;
      const clone = g.nodes.find((n) => n.id === sel);
      return {
        selected: sel,
        cloneKind: clone?.kind ?? null,
        edges: g.edges.length,
        clonePos: sel ? g.positions[sel] : null,
      };
    });

    // Selection moved to the new clone, not the original.
    expect(after.selected).not.toBeNull();
    expect(after.selected).not.toBe("s1");
    expect(after.cloneKind).toBe("shader");
    // Edges are intentionally not duplicated.
    expect(after.edges).toBe(trivialMeshGraph().edges.length);
    // Clone is offset from the source position (200,0 → 240,40).
    expect(after.clonePos).toEqual({ x: 240, y: 40 });
  });

  test("Cmd/Ctrl+D with no selection is a no-op", async ({ page }) => {
    await setGraph(page, trivialMeshGraph(), {});
    await withSp(page, (sp) => sp.selection.getState().select(null), null);
    await page.evaluate(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    });

    const before = await readSp(page, (sp) => sp.graph.getState().nodes.length);
    await page.keyboard.press("Meta+d");
    // Give the handler a frame; the count must stay put.
    await page.waitForTimeout(150);
    const after = await readSp(page, (sp) => sp.graph.getState().nodes.length);
    expect(after).toBe(before);
  });
});
