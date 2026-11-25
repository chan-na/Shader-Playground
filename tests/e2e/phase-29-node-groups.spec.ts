import { expect, test } from "@playwright/test";
import { blurActive } from "./helpers/dom";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { expectNoRendererErrors } from "./helpers/render";
import { readSp, withSp } from "./helpers/sp";

// Phase 29 — node groups. Pure visual containers tracked via a `parents` map
// in graphStore. ExecutionPlan and the render path ignore them entirely;
// these tests verify the editor-side behaviors: Cmd+G, undo, and that the
// demo graph keeps rendering with a group dropped on top. The store actions
// themselves (addGroup, groupSelected, setParent cycle rejection, nested
// grouping, removeGroup in both modes) are covered by the graphStore unit
// tests ("groups" describe block).

test.describe("Phase 29 — node groups", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("Cmd+G wraps the current selection in a new group", async ({ page }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 100, y: 100 },
      s1: { x: 300, y: 200 },
      o1: { x: 500, y: 100 },
    });

    // Multi-select m1 and s1 via the selection store, then blur so the
    // keystroke reaches the global window listener (not a CM editor).
    await withSp(
      page,
      (sp) => sp.selection.getState().setSelectedIds(["m1", "s1"]),
      null,
    );
    await blurActive(page);

    const beforeCount = await readSp(
      page,
      (sp) => sp.graph.getState().nodes.length,
    );
    await page.keyboard.press("Meta+g");
    await expect
      .poll(() => readSp(page, (sp) => sp.graph.getState().nodes.length))
      .toBe(beforeCount + 1);

    const next = await readSp(page, (sp) => {
      const g = sp.graph.getState();
      const newGroupId = g.nodes.find((n) => n.kind === "group")?.id ?? null;
      return {
        newGroupId,
        m1Parent: g.parents.m1,
        s1Parent: g.parents.s1,
        selectedId: sp.selection.getState().selectedNodeId,
      };
    });
    expect(next.newGroupId).not.toBeNull();
    expect(next.m1Parent).toBe(next.newGroupId);
    expect(next.s1Parent).toBe(next.newGroupId);
    // Selection moves to the new group.
    expect(next.selectedId).toBe(next.newGroupId);
  });

  test("compile pipeline ignores group nodes — render proceeds as if they weren't there", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 0, y: 0 },
      s1: { x: 200, y: 0 },
      o1: { x: 400, y: 0 },
    });

    // Play the timeline so the RAF gate is forced dirty every frame — otherwise
    // static graphs stop drawing once they reach steady state.
    await withSp(page, (sp) => sp.time.getState().setPlaying(true), null);

    // Capture a baseline cumulative render-tick count. stats.frame is a 500ms
    // sliding window so it can decrease; renderTick is monotonic.
    const beforeTick = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.renderTick,
    );

    // Drop a group on top of the running pipeline and reparent the shader
    // into it. setParent bumps rev → recompile → fresh frame.
    await withSp(
      page,
      (sp) => {
        const gid = sp.graph
          .getState()
          .addGroup("Layer", { x: 100, y: 100 }, { width: 400, height: 300 });
        sp.graph.getState().setParent("s1", gid);
      },
      null,
    );

    // renderTick should keep climbing — group did not break the loop.
    await expect
      .poll(() => readSp(page, (sp) => sp.renderer.getState().stats.renderTick))
      .toBeGreaterThan(beforeTick);

    // No runtime errors recorded after the group landed.
    await expectNoRendererErrors(page);
  });

  test("setGraph with a parents map round-trips through history (undo restores groups)", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 100, y: 100 },
      s1: { x: 300, y: 200 },
      o1: { x: 500, y: 100 },
    });

    const { gid, historyLen } = await withSp(
      page,
      (sp) => {
        const id = sp.graph.getState().groupSelected(["m1", "s1"]);
        return {
          gid: id,
          historyLen: sp.history.getState().past.length,
        };
      },
      null,
    );
    expect(gid).not.toBeNull();
    expect(historyLen).toBeGreaterThan(0);

    // Now undo through the global key to roll the group back. The graph
    // should lose the group node and the parents map should be empty for
    // the children that were just placed inside it.
    await blurActive(page);
    await page.keyboard.press("Meta+z");

    const after = await readSp(page, (sp) => {
      const g = sp.graph.getState();
      const groupStill = g.nodes.find((n) => n.kind === "group");
      return {
        hasGroup: !!groupStill,
        m1Parent: g.parents.m1,
        s1Parent: g.parents.s1,
      };
    });
    expect(after.hasGroup).toBe(false);
    expect(after.m1Parent).toBeUndefined();
    expect(after.s1Parent).toBeUndefined();
  });
});
