import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Phase 29 — node groups. Pure visual containers tracked via a `parents` map
// in graphStore. ExecutionPlan and the render path ignore them entirely;
// these tests verify the editor-side behaviors: create, assign via store,
// nested groups, ungroup release, cascade delete, and that the demo graph
// keeps rendering with a group dropped on top.

test.describe("Phase 29 — node groups", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("addGroup creates a group node with a fresh id and assigns positions/parents nothing", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 0, y: 0 },
      s1: { x: 200, y: 0 },
      o1: { x: 400, y: 0 },
    });

    const beforeRev = await readSp(page, (sp) => sp.graph.getState().rev);
    const gid = await withSp(
      page,
      (sp) =>
        sp.graph
          .getState()
          .addGroup(
            "Section",
            { x: -100, y: -50 },
            { width: 300, height: 200 },
          ),
      null,
    );
    expect(gid).toMatch(/^group/);

    const next = await readSp(page, (sp) => ({
      rev: sp.graph.getState().rev,
      nodeIds: sp.graph.getState().nodes.map((n) => n.id),
      pos: sp.graph.getState().positions,
      parents: sp.graph.getState().parents,
    }));
    expect(next.rev).toBe(beforeRev + 1);
    expect(next.nodeIds).toContain(gid);
    expect(next.pos[gid]).toEqual({ x: -100, y: -50 });
    // Top-level group — no parent.
    expect(next.parents[gid]).toBeUndefined();
  });

  test("groupSelected wraps multiple nodes — parent assigned, group positioned at upper-left of bbox", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 100, y: 100 },
      s1: { x: 300, y: 200 },
      o1: { x: 500, y: 100 },
    });

    const gid = await withSp(
      page,
      (sp) => sp.graph.getState().groupSelected(["m1", "s1"]),
      null,
    );
    expect(gid).not.toBeNull();

    const next = await withSp(
      page,
      (sp, args) => {
        const g = sp.graph.getState();
        return {
          parents: g.parents,
          // After grouping, the children's `positions` are parent-relative —
          // they should be small offsets, not the original absolute coords.
          m1Pos: g.positions.m1,
          s1Pos: g.positions.s1,
          groupPos: args.gid ? g.positions[args.gid] : null,
        };
      },
      { gid },
    );
    expect(next.parents.m1).toBe(gid);
    expect(next.parents.s1).toBe(gid);
    // Group sits to the upper-left of both children.
    expect(next.groupPos).not.toBeNull();
    expect(next.groupPos!.x).toBeLessThanOrEqual(100);
    expect(next.groupPos!.y).toBeLessThanOrEqual(100);
    // Children's relative positions are small (offset from group's origin).
    expect(next.m1Pos!.x).toBeGreaterThan(0);
    expect(next.s1Pos!.x).toBeGreaterThan(next.m1Pos!.x);
  });

  test("nested groups: groupSelected on already-parented children creates an inner group inside the outer", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 100, y: 100 },
      s1: { x: 300, y: 200 },
      o1: { x: 500, y: 100 },
    });

    // First wrap m1+s1 in an outer group.
    const outer = await withSp(
      page,
      (sp) => sp.graph.getState().groupSelected(["m1", "s1"]),
      null,
    );
    expect(outer).not.toBeNull();

    // Then wrap just m1 in a sub-group. Because m1's parent is `outer`,
    // groupSelected should detect the common parent and place the new
    // inner group inside `outer`.
    const inner = await withSp(
      page,
      (sp) => sp.graph.getState().groupSelected(["m1"]),
      null,
    );
    expect(inner).not.toBeNull();

    const next = await readSp(page, (sp) => sp.graph.getState().parents);
    expect(next[inner!]).toBe(outer);
    expect(next.m1).toBe(inner);
    expect(next.s1).toBe(outer);
  });

  test("setParent rejects a cycle and returns false", async ({ page }) => {
    await setGraph(page, trivialMeshGraph(), {});

    const { g1, g2, ok } = await withSp(
      page,
      (sp) => {
        const g1 = sp.graph
          .getState()
          .addGroup("g1", { x: 0, y: 0 }, { width: 300, height: 200 });
        const g2 = sp.graph
          .getState()
          .addGroup("g2", { x: 50, y: 50 }, { width: 200, height: 150 });
        sp.graph.getState().setParent(g2, g1);
        // Trying to make g1 a child of g2 would close a loop — must return false.
        const ok = sp.graph.getState().setParent(g1, g2);
        return { g1, g2, ok };
      },
      null,
    );
    expect(ok).toBe(false);
    expect(g1).not.toBe(g2);

    const parents = await readSp(page, (sp) => sp.graph.getState().parents);
    // g2 remained child of g1; g1 has no parent.
    expect(parents[g2]).toBe(g1);
    expect(parents[g1]).toBeUndefined();
  });

  test("removeGroup release-children promotes direct children at their absolute positions", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 240, y: 230 },
      s1: { x: 280, y: 270 },
      o1: { x: 500, y: 100 },
    });

    const gid = await withSp(
      page,
      (sp) =>
        sp.graph
          .getState()
          .addGroup("G", { x: 200, y: 200 }, { width: 300, height: 200 }),
      null,
    );
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().setParent("m1", args.gid);
      },
      { gid },
    );

    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().removeGroup(args.gid, "release-children");
      },
      { gid },
    );
    const next = await withSp(
      page,
      (sp, args) => {
        const g = sp.graph.getState();
        return {
          groupGone: !g.nodes.some((n) => n.id === args.gid),
          m1Pos: g.positions.m1,
          m1Parent: g.parents.m1,
        };
      },
      { gid },
    );
    expect(next.groupGone).toBe(true);
    expect(next.m1Parent).toBeUndefined();
    // Position should be promoted back to absolute (m1 was at abs 240,230).
    expect(next.m1Pos).toEqual({ x: 240, y: 230 });
  });

  test("removeGroup delete-children cascades through descendants", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 100, y: 100 },
      s1: { x: 300, y: 100 },
      o1: { x: 500, y: 100 },
    });

    const { outer, inner } = await withSp(
      page,
      (sp) => {
        const outer = sp.graph
          .getState()
          .addGroup("outer", { x: 50, y: 50 }, { width: 600, height: 400 });
        const inner = sp.graph
          .getState()
          .addGroup("inner", { x: 80, y: 80 }, { width: 300, height: 200 });
        sp.graph.getState().setParent(inner, outer);
        sp.graph.getState().setParent("m1", inner);
        sp.graph.getState().setParent("s1", inner);
        return { outer, inner };
      },
      null,
    );

    const before = await readSp(page, (sp) => sp.graph.getState().nodes.length);
    expect(before).toBeGreaterThanOrEqual(5);

    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().removeGroup(args.outer, "delete-children");
      },
      { outer },
    );

    const after = await readSp(page, (sp) => {
      const g = sp.graph.getState();
      return {
        nodeIds: g.nodes.map((n) => n.id),
        edgeCount: g.edges.length,
      };
    });
    // outer, inner, m1, s1 all gone. Only o1 should remain.
    expect(after.nodeIds).not.toContain(outer);
    expect(after.nodeIds).not.toContain(inner);
    expect(after.nodeIds).not.toContain("m1");
    expect(after.nodeIds).not.toContain("s1");
    expect(after.nodeIds).toContain("o1");
    // Edges referencing removed nodes must also be gone.
    expect(after.edgeCount).toBe(0);
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
    await page.evaluate(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    });

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
    const errors = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.errors,
    );
    expect(errors).toEqual([]);
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
    await page.evaluate(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    });
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
