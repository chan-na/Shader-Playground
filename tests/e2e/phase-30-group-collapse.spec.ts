import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Phase 30 — group collapse/expand (+ header double-click rename). Collapsing
// is a pure editor-layer concern: the ExecutionPlan never sees groups, so a
// collapsed group hides its descendants and shrinks to its header without ever
// touching the render path. These tests cover the store toggle, the DOM
// hide/restore of descendants, the chevron button, loading a pre-collapsed
// graph, inline rename, and a render-loop regression guard.
//
// NOTE: readSp/withSp callbacks are serialized to the browser, so closure
// variables (like `gid`) are NOT available inside them — we always read state
// out and compare in Node, or pass ids through withSp's `args`.

/** Read a single group node's collapsed flag back in the Node context. */
async function collapsedOf(
  page: import("@playwright/test").Page,
  gid: string,
): Promise<boolean | null | undefined> {
  const nodes = await readSp(page, (sp) => sp.graph.getState().nodes);
  const n = nodes.find((x) => x.id === gid);
  return n?.kind === "group" ? (n.collapsed as boolean | undefined) : null;
}

test.describe("Phase 30 — group collapse/expand", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("toggleGroupCollapsed flips the collapsed flag and bumps rev", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 100, y: 100 },
      s1: { x: 300, y: 100 },
      o1: { x: 500, y: 100 },
    });

    const gid = await withSp(
      page,
      (sp) =>
        sp.graph
          .getState()
          .addGroup("G", { x: 50, y: 50 }, { width: 400, height: 300 }),
      null,
    );

    const beforeRev = await readSp(page, (sp) => sp.graph.getState().rev);
    await withSp(
      page,
      (sp, args) => sp.graph.getState().toggleGroupCollapsed(args.gid),
      { gid },
    );

    expect(await collapsedOf(page, gid)).toBe(true);
    expect(await readSp(page, (sp) => sp.graph.getState().rev)).toBe(
      beforeRev + 1,
    );

    // Toggling again expands.
    await withSp(
      page,
      (sp, args) => sp.graph.getState().toggleGroupCollapsed(args.gid),
      { gid },
    );
    expect(await collapsedOf(page, gid)).toBe(false);
  });

  test("collapsing a group hides its descendants in the DOM; expanding restores them", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 100, y: 100 },
      s1: { x: 300, y: 200 },
      o1: { x: 500, y: 100 },
    });

    // Wrap m1 + s1 in a group; o1 stays at top level.
    const gid = await withSp(
      page,
      (sp) => sp.graph.getState().groupSelected(["m1", "s1"]),
      null,
    );
    if (gid === null) throw new Error("groupSelected returned null");

    const m1Node = page.locator('.react-flow__node[data-id="m1"]');
    const s1Node = page.locator('.react-flow__node[data-id="s1"]');
    const o1Node = page.locator('.react-flow__node[data-id="o1"]');

    // Expanded: children present in DOM.
    await expect(m1Node).toHaveCount(1);
    await expect(s1Node).toHaveCount(1);

    await withSp(
      page,
      (sp, args) => sp.graph.getState().toggleGroupCollapsed(args.gid),
      { gid },
    );

    // Collapsed: children removed from DOM, but the ungrouped o1 stays.
    await expect(m1Node).toHaveCount(0);
    await expect(s1Node).toHaveCount(0);
    await expect(o1Node).toHaveCount(1);
    // The group card itself remains and is marked collapsed.
    await expect(page.locator(`[data-group-id="${gid}"]`)).toHaveAttribute(
      "data-collapsed",
      "true",
    );

    // Expand: children come back.
    await withSp(
      page,
      (sp, args) => sp.graph.getState().toggleGroupCollapsed(args.gid),
      { gid },
    );
    await expect(m1Node).toHaveCount(1);
    await expect(s1Node).toHaveCount(1);
  });

  test("the header chevron button toggles collapse", async ({ page }) => {
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
    if (gid === null) throw new Error("groupSelected returned null");

    const toggle = page.locator(
      `[data-group-id="${gid}"] [data-testid="group-collapse-toggle"]`,
    );
    await toggle.click();
    await expect.poll(() => collapsedOf(page, gid)).toBe(true);

    await toggle.click();
    await expect.poll(() => collapsedOf(page, gid)).toBe(false);
  });

  test("a graph loaded with a pre-collapsed group renders collapsed with children hidden", async ({
    page,
  }) => {
    const base = trivialMeshGraph();
    const graph = {
      nodes: [
        ...base.nodes,
        {
          id: "g1",
          kind: "group" as const,
          label: "Folded",
          width: 400,
          height: 300,
          collapsed: true,
        },
      ],
      edges: base.edges,
    };
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().setGraph(args.graph, args.positions, args.parents);
      },
      {
        graph,
        positions: {
          g1: { x: 40, y: 40 },
          m1: { x: 20, y: 40 },
          s1: { x: 20, y: 120 },
          o1: { x: 600, y: 40 },
        },
        parents: { m1: "g1", s1: "g1" },
      },
    );

    await expect(page.locator('[data-group-id="g1"]')).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    // Children of the pre-collapsed group must not render.
    await expect(page.locator('.react-flow__node[data-id="m1"]')).toHaveCount(
      0,
    );
    await expect(page.locator('.react-flow__node[data-id="s1"]')).toHaveCount(
      0,
    );
    // The top-level output stays visible.
    await expect(page.locator('.react-flow__node[data-id="o1"]')).toHaveCount(
      1,
    );
  });

  test("double-clicking the header renames the group inline", async ({
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
    if (gid === null) throw new Error("groupSelected returned null");

    // Clear selection so the NodeResizer overlay isn't covering the header.
    await withSp(page, (sp) => sp.selection.getState().select(null), null);

    const label = page.locator(
      `[data-group-id="${gid}"] [data-testid="group-label-text"]`,
    );
    await label.dblclick();
    const input = page.locator(
      `[data-group-id="${gid}"] [data-testid="group-label-inline-input"]`,
    );
    await expect(input).toBeVisible();
    await input.fill("Renamed Layer");
    await input.press("Enter");

    await expect
      .poll(async () => {
        const nodes = await readSp(page, (sp) => sp.graph.getState().nodes);
        const n = nodes.find((x) => x.id === gid);
        return n?.kind === "group" ? (n.label as string) : null;
      })
      .toBe("Renamed Layer");
  });

  test("collapsing does not break the render loop (editor-only change)", async ({
    page,
  }) => {
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: 0, y: 0 },
      s1: { x: 200, y: 0 },
      o1: { x: 400, y: 0 },
    });
    await withSp(page, (sp) => sp.time.getState().setPlaying(true), null);

    const gid = await withSp(
      page,
      (sp) => {
        const id = sp.graph
          .getState()
          .addGroup("Layer", { x: 100, y: 100 }, { width: 400, height: 300 });
        sp.graph.getState().setParent("s1", id);
        return id;
      },
      null,
    );

    const beforeTick = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.renderTick,
    );
    await withSp(
      page,
      (sp, args) => sp.graph.getState().toggleGroupCollapsed(args.gid),
      { gid },
    );

    await expect
      .poll(() => readSp(page, (sp) => sp.renderer.getState().stats.renderTick))
      .toBeGreaterThan(beforeTick);
    const errors = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.errors,
    );
    expect(errors).toEqual([]);
  });
});
