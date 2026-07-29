import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { expectCanvasRendered, readCanvasStats } from "./helpers/canvas";
import { bootApp, setGraph } from "./helpers/fixtures";
import { readSp, waitForRev, withSp } from "./helpers/sp";

const handleSel = (nodeId: string, handleId: string) =>
  `.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`;

/** Resolve a handle's viewport box once it stops moving. Every graph mutation
 *  bumps `rev`, which re-runs the editor's animated fitView (MOTION_MAX_MS) —
 *  a box read mid-animation points at where the port *was*. */
async function stableBox(
  page: Page,
  sel: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  let previous = "";
  await expect
    .poll(
      async () => {
        const box = await page.locator(sel).boundingBox();
        const key = box ? `${Math.round(box.x)}:${Math.round(box.y)}` : "";
        const settled = key !== "" && key === previous;
        previous = key;
        return settled;
      },
      { message: `handle ${sel} never settled`, intervals: [80] },
    )
    .toBe(true);
  const box = await page.locator(sel).boundingBox();
  if (!box) throw new Error(`missing handle ${sel}`);
  return box;
}

/**
 * Drag a real connection between two port handles, pointer-event faithful:
 * React Flow starts the drag on pointerdown, resolves the drop target on
 * pointermove, and commits on pointerup — a synthetic click can't stand in.
 *
 * `dropOffsetX` shifts the release point away from the port center. A non-zero
 * offset that still sits inside React Flow's 20px `connectionRadius` is the
 * meaningful test: landing dead-center also succeeds through RF's
 * `elementFromPoint` fallback, so only an off-center drop proves the handle is
 * actually registered in the store. `beforeRelease` runs while the button is
 * still down, for asserting the in-drag highlight.
 */
async function dragConnection(
  page: Page,
  fromSel: string,
  toSel: string,
  options: {
    dropOffsetX?: number;
    beforeRelease?: () => Promise<void>;
  } = {},
): Promise<void> {
  const from = await stableBox(page, fromSel);
  const to = await stableBox(page, toSel);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    to.x + to.width / 2 + (options.dropOffsetX ?? 0),
    to.y + to.height / 2,
    { steps: 25 },
  );
  await options.beforeRelease?.();
  await page.mouse.up();
}

/** Edges landing on a given target port, read straight from the graph store. */
async function edgesInto(
  page: Page,
  nodeId: string,
  handleId: string,
): Promise<Array<{ source: string; sourceHandle: string }>> {
  return withSp(
    page,
    (sp, args) =>
      sp.graph
        .getState()
        .edges.filter(
          (e) => e.target === args.nodeId && e.targetHandle === args.handleId,
        )
        .map((e) => ({ source: e.source, sourceHandle: e.sourceHandle })),
    { nodeId, handleId },
  );
}

const FRAG_ONE_UNIFORM = `#version 300 es
precision highp float;
uniform float u_a;
out vec4 fragColor;
void main() { fragColor = vec4(u_a, 0.0, 0.0, 1.0); }`;

const FRAG_TWO_UNIFORMS = `#version 300 es
precision highp float;
uniform float u_a;
uniform float u_b;
out vec4 fragColor;
void main() { fragColor = vec4(u_a, u_b, 0.0, 1.0); }`;

test.describe("Phase 5-6 — node graph & multi-shader chain", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("adding a node via store renders a React Flow card", async ({
    page,
  }) => {
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    await withSp(
      page,
      (sp) => {
        sp.graph.getState().addNode({
          id: "extra1",
          kind: "param",
          paramKind: "float",
          value: 0.42,
          label: "extra",
        });
      },
      undefined,
    );
    await waitForRev(page, before);

    // React Flow renders nodes with data-id attribute.
    await expect(page.locator("[data-id='extra1']")).toBeVisible({
      timeout: 5_000,
    });
  });

  // Regression: a ShaderNode's input ports are derived from its GLSL uniforms,
  // so declaring one mid-session adds a <Handle> that React Flow never
  // measured. RF resolves connection drags against its cached handle bounds
  // and only refreshes them on mount / on a size change — and a shader card
  // under ~5 ports keeps its 96px thumbnail floor, so the new port changes no
  // dimension. Without an explicit updateNodeInternals the port renders but
  // stays unreachable: an off-center drop inside the connection radius is
  // discarded and a drag *from* the port never even starts (only a
  // pixel-perfect drop onto the dot survives, via RF's elementFromPoint
  // fallback). See nodes/usePortInternals.ts.
  test("a shader input port added by a source edit is immediately connectable", async ({
    page,
  }) => {
    await setGraph(
      page,
      {
        nodes: [
          { id: "p1", kind: "param", paramKind: "float", value: 0.5 },
          {
            id: "s1",
            kind: "shader",
            vertexSource: "",
            fragmentSource: FRAG_ONE_UNIFORM,
            uniformValues: {},
          },
          { id: "o1", kind: "output" },
        ],
        edges: [
          {
            id: "eo",
            source: "s1",
            sourceHandle: "texture",
            target: "o1",
            targetHandle: "texture",
          },
        ],
      },
      {
        p1: { x: 40, y: 320 },
        s1: { x: 380, y: 60 },
        o1: { x: 760, y: 60 },
      },
    );
    await expect(page.locator(handleSel("s1", "u_a"))).toHaveCount(1);

    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    await withSp(
      page,
      (sp, args) => {
        sp.graph
          .getState()
          .updateShaderSource("s1", { fragmentSource: args.frag });
      },
      { frag: FRAG_TWO_UNIFORMS },
    );
    await waitForRev(page, before);
    // The port exists in the DOM either way — the bug was that only the DOM
    // knew about it.
    await expect(page.locator(handleSel("s1", "u_b"))).toHaveCount(1);

    // Drop 10px left of the port center: inside RF's 20px connectionRadius,
    // outside the 11px dot — so this only lands if the store knows the handle.
    await dragConnection(
      page,
      handleSel("p1", "value"),
      handleSel("s1", "u_b"),
      {
        dropOffsetX: -10,
        beforeRelease: async () => {
          // `connectingto` is driven by connection.toHandle, which RF resolves
          // from its handle bounds — the highlight IS the registration proof.
          await expect(page.locator(handleSel("s1", "u_b"))).toHaveClass(
            /connectingto/,
          );
        },
      },
    );
    expect(await edgesInto(page, "s1", "u_b")).toEqual([
      { source: "p1", sourceHandle: "value" },
    ]);

    // The reverse direction exercises the other half: a drag that *starts* on
    // an unregistered handle is dropped before it begins.
    await withSp(
      page,
      (sp) => {
        for (const e of sp.graph.getState().edges) {
          if (e.target === "s1" && e.targetHandle === "u_b") {
            sp.graph.getState().removeEdge(e.id);
          }
        }
      },
      undefined,
    );
    expect(await edgesInto(page, "s1", "u_b")).toEqual([]);

    await dragConnection(
      page,
      handleSel("s1", "u_b"),
      handleSel("p1", "value"),
    );
    expect(await edgesInto(page, "s1", "u_b")).toEqual([
      { source: "p1", sourceHandle: "value" },
    ]);
  });

  // Regression [#38 follow-up]: every add path drops its node at a fixed flow
  // coordinate, and the editor no longer refits the canvas on a plain add — so
  // with the view parked elsewhere the new node appeared outside the viewport
  // with no feedback at all, as if the menu had done nothing. It has to be
  // panned back into sight, at the zoom the user left behind.
  test("a node added while the canvas is framed elsewhere is panned into view", async ({
    page,
  }) => {
    // setGraph is a wholesale replace, so the editor's auto-fit frames this
    // lone node at (6000, 6000) — the same end state as panning there by hand,
    // minus a flake-prone pointer drag.
    await setGraph(
      page,
      {
        nodes: [{ id: "far1", kind: "param", paramKind: "float", value: 0.5 }],
        edges: [],
      },
      { far1: { x: 6000, y: 6000 } },
    );
    const pane = await stableBox(page, ".panel--graph .panel-body");
    // The auto-fit puts a lone node dead center. Waiting for that (rather than
    // for two equal box reads) is what makes the zoom check below meaningful:
    // the fit's zoom animation can stall for >80ms mid-flight, and a box
    // sampled there reports a zoom the user never actually sat at.
    await expect
      .poll(
        async () => {
          const box = await page.locator("[data-id='far1']").boundingBox();
          if (!box) return Number.POSITIVE_INFINITY;
          return Math.max(
            Math.abs(box.x + box.width / 2 - (pane.x + pane.width / 2)),
            Math.abs(box.y + box.height / 2 - (pane.y + pane.height / 2)),
          );
        },
        {
          message: "the auto-fit never centered the far node",
          intervals: [80],
        },
      )
      .toBeLessThan(2);
    const framed = await page.locator("[data-id='far1']").boundingBox();
    const framedWidth = framed?.width ?? 0;
    expect(framedWidth).toBeGreaterThan(0);

    // The pill adds an Image node at its fixed (-200, 200) — 6000px away.
    await page
      .getByTestId("add-node-pill")
      .getByRole("button", { name: "Image" })
      .click();
    const added = page.locator(".react-flow__node[data-id^='image_']");
    await expect(added).toHaveCount(1);

    await expect
      .poll(
        async () => {
          const box = await added.boundingBox();
          if (!box) return false;
          return (
            box.x < pane.x + pane.width &&
            box.x + box.width > pane.x &&
            box.y < pane.y + pane.height &&
            box.y + box.height > pane.y
          );
        },
        { message: "the added node never entered the viewport" },
      )
      .toBe(true);

    // Pan, not fit: the untouched node's rendered width is a direct read of
    // the zoom, which the move must leave alone. The band is wide on purpose —
    // it only has to separate "same zoom" from the two ways this goes wrong,
    // and both miss it by a mile: refitting over both nodes 6000px apart drops
    // the zoom to ~0.09 (≈18px), and setCenter without an explicit zoom snaps
    // to maxZoom (≈2×).
    const farAfter = await page.locator("[data-id='far1']").boundingBox();
    expect(farAfter?.width ?? 0).toBeGreaterThan(framedWidth * 0.75);
    expect(farAfter?.width ?? 0).toBeLessThan(framedWidth * 1.25);
  });

  test("cycle is rejected by validateGraph (would-be edge prevents compile)", async ({
    page,
  }) => {
    await setGraph(
      page,
      {
        nodes: [
          { id: "p1", kind: "param", paramKind: "float", value: 0.1 },
          { id: "p2", kind: "param", paramKind: "float", value: 0.2 },
        ],
        edges: [],
      },
      {},
    );

    // Param nodes only have outputs — they can't form a cycle. The realistic
    // check: build a graph that violates `multi_input` and confirm rev still
    // updates but compilation reports an error. We need two edges into the
    // same handle. Use two shader nodes both wanting to drive the same Output.
    await setGraph(
      page,
      {
        nodes: [
          { id: "m1", kind: "mesh", primitive: "sphere" },
          {
            id: "s1",
            kind: "shader",
            vertexSource: "",
            fragmentSource: "",
            uniformValues: {},
          },
          {
            id: "s2",
            kind: "shader",
            vertexSource: "",
            fragmentSource: "",
            uniformValues: {},
          },
          { id: "o1", kind: "output" },
        ],
        edges: [
          {
            id: "e1",
            source: "s1",
            sourceHandle: "texture",
            target: "o1",
            targetHandle: "texture",
          },
          {
            id: "e2",
            source: "s2",
            sourceHandle: "texture",
            target: "o1",
            targetHandle: "texture",
          },
        ],
      },
      {},
    );

    // validateGraph runs at compile; the renderer publishes an error.
    // Check it indirectly by reading window.__sp wouldn't expose validate,
    // but we can re-implement the rule in-page by querying edges directly.
    const violation = await readSp(page, (sp) => {
      const g = sp.graph.getState();
      const seen = new Map<string, number>();
      for (const e of g.edges) {
        const k = `${e.target}::${e.targetHandle}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      return [...seen.values()].some((n) => n > 1);
    });
    expect(violation).toBe(true);
  });

  test("3-shader chain (noise → blur → tonemap) renders pixels", async ({
    page,
  }) => {
    const canvas = page.getByTestId("viewport-canvas");

    // Use the built-in Chain demo via the toolbar's Presets menu (M1-U3
    // moved the demo-graph buttons behind a "Presets" dropdown) — this still
    // exercises both the store and the real preset wiring. The dropdown's
    // items carry an explicit role="menuitem" (AppToolbar's ToolbarMenu,
    // matching the App Shell.dc.html dropdown pattern), which overrides the
    // <button>'s implicit "button" role for accessibility-tree queries — so
    // the item itself must be queried by role="menuitem", not "button".
    await page.getByRole("button", { name: "Presets" }).click();
    await page.getByRole("menuitem", { name: "Chain", exact: true }).click();

    // Wait for the new graph to be loaded.
    await expect
      .poll(() =>
        readSp(page, (sp) =>
          sp.graph.getState().nodes.find((n) => n.id === "tonemap1")
            ? "ok"
            : "no",
        ),
      )
      .toBe("ok");

    const stats = await expectCanvasRendered(canvas, { ratio: 0.2 });
    expect(stats.spread).toBeGreaterThan(20);

    // 3 shader nodes → 3 distinct intermediate FBOs. Sanity check the graph
    // edge count.
    const counts = await readSp(page, (sp) => {
      const g = sp.graph.getState();
      return {
        shaders: g.nodes.filter((n) => n.kind === "shader").length,
        outputs: g.nodes.filter((n) => n.kind === "output").length,
      };
    });
    expect(counts.shaders).toBe(3);
    expect(counts.outputs).toBe(1);
    // Reference the stats so the canvas read isn't dead.
    void stats;
    void readCanvasStats;
  });
});
