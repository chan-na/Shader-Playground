import { expect, test } from "@playwright/test";
import { expectCanvasRendered, readCanvasStats } from "./helpers/canvas";
import { bootApp } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

/**
 * Phase 38 — mental model correction (docs/learnability-plan-2026-08.md T3),
 * unit U1's slice: C-2 (`uniformValues` hardcoding → GLSL `@default`) + F-2
 * (demo lesson groups). E-2/E-3/F-1 are covered by the parallel units' own
 * specs.
 *
 * C-2's invariant under test: a brand-new Shader node is created with
 * `uniformValues: {}` (no hardcoded seed value survives in TS anywhere) yet
 * still renders its starter.frag glow, because compile.ts seeds the compiled
 * pass from the GLSL source's `@default` hint. A stored value (once the user
 * or the graph itself writes one) always wins over that hint.
 */

test.describe("Phase 38 — C-2 @default binding", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("AddNodePill Shader is born with uniformValues:{} and still renders via @default (no hardcoded seed)", async ({
    page,
  }) => {
    const canvas = page.getByTestId("viewport-canvas");

    // Start from a blank graph so the canvas's render state afterward is
    // attributable only to the two nodes this test wires up next.
    await withSp(
      page,
      (sp) => {
        sp.graph.getState().reset();
      },
      null,
    );

    await page
      .getByTestId("add-node-pill")
      .getByRole("button", { name: "Shader" })
      .click();
    const shaderId = await readSp(
      page,
      (sp) => sp.selection.getState().selectedNodeId,
    );
    if (!shaderId) {
      throw new Error("AddNodePill Shader did not select a new node");
    }

    const shaderUniforms = await withSp(
      page,
      (sp, args) =>
        sp.graph.getState().nodes.find((n) => n.id === args.id)?.uniformValues,
      { id: shaderId },
    );
    // The acceptance-criteria grep target: no `u_baseColor: [0.5, ...]` (or
    // any other key) survives node creation — the node's initial glow comes
    // entirely from starter.frag's `@default` hint at compile time.
    expect(shaderUniforms).toEqual({});

    await page
      .getByTestId("add-node-pill")
      .getByRole("button", { name: "Output" })
      .click();
    const outputId = await readSp(
      page,
      (sp) => sp.selection.getState().selectedNodeId,
    );
    if (!outputId) {
      throw new Error("AddNodePill Output did not select a new node");
    }

    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().addEdge({
          id: "e-phase38-1",
          source: args.shaderId,
          sourceHandle: "texture",
          target: args.outputId,
          targetHandle: "texture",
        });
      },
      { shaderId, outputId },
    );

    // starter.frag needs no mesh input (fullscreen substitution), so wiring
    // shader → output alone is a minimal renderable pipeline.
    //
    // A non-zero-pixel ratio alone CANNOT catch a broken @default binding:
    // starter.frag's `0.05*sin(u_time…)` term lights ~47% of pixels at
    // 1–13/255 even with u_baseColor at GL zero, which sails past the 5%
    // ratio gate (this exact false-green shipped once — the seeded map was
    // clobbered by the Viewport's per-frame uniform hot-patch and the canvas
    // rendered near-black gray bands while this spec stayed green). Assert
    // the glow's actual blue-channel average instead: @default [0.5,0.7,1.0]
    // is blue-dominant — measured healthy avg.b ≈ 135 vs broken ≈ 8, so 60
    // splits the two with wide margin on both sides.
    await expectCanvasRendered(canvas);
    await expect
      .poll(async () => (await readCanvasStats(canvas)).avg.b, {
        timeout: 10_000,
        intervals: [100, 200, 500, 1000],
        message:
          "viewport lacks the blue-dominant @default glow (u_baseColor likely fell back to GL zero)",
      })
      .toBeGreaterThan(60);
  });

  test("a stored uniform value is written to the graph node (stored-value path)", async ({
    page,
  }) => {
    await page
      .getByTestId("add-node-pill")
      .getByRole("button", { name: "Shader" })
      .click();
    const shaderId = await readSp(
      page,
      (sp) => sp.selection.getState().selectedNodeId,
    );
    if (!shaderId) {
      throw new Error("AddNodePill Shader did not select a new node");
    }

    // Freshly created — no stored value yet (C-2).
    const before = await withSp(
      page,
      (sp, args) =>
        sp.graph.getState().nodes.find((n) => n.id === args.id)?.uniformValues,
      { id: shaderId },
    );
    expect(before).toEqual({});

    await withSp(
      page,
      (sp, args) => {
        sp.graph
          .getState()
          .setUniformValue(args.id, "u_baseColor", [0.9, 0.1, 0.1]);
      },
      { id: shaderId },
    );

    const after = await withSp(
      page,
      (sp, args) =>
        sp.graph.getState().nodes.find((n) => n.id === args.id)?.uniformValues,
      { id: shaderId },
    );
    expect(after).toEqual({ u_baseColor: [0.9, 0.1, 0.1] });
  });
});

test.describe("Phase 38 — F-2 demo lesson groups", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("the default boot demo shows lesson group labels with a non-empty parents map", async ({
    page,
  }) => {
    await expect(page.getByTestId("group-label-text").first()).toBeVisible();
    expect(await page.getByTestId("group-label-text").count()).toBeGreaterThan(
      0,
    );

    const parents = await readSp(page, (sp) => sp.graph.getState().parents);
    expect(Object.keys(parents).length).toBeGreaterThan(0);
  });

  test("Presets → Chain loads with its own lesson group labels", async ({
    page,
  }) => {
    // Same path as phase-5-6-graph-chain.spec.ts's chain load: the dropdown
    // item carries an explicit role="menuitem" (AppToolbar's ToolbarMenu).
    await page.getByRole("button", { name: "Presets" }).click();
    await page.getByRole("menuitem", { name: "Chain", exact: true }).click();

    await expect
      .poll(() =>
        readSp(page, (sp) =>
          sp.graph.getState().nodes.find((n) => n.id === "tonemap1")
            ? "ok"
            : "no",
        ),
      )
      .toBe("ok");

    await expect(page.getByTestId("group-label-text").first()).toBeVisible();
    const parents = await readSp(page, (sp) => sp.graph.getState().parents);
    expect(Object.keys(parents).length).toBeGreaterThan(0);
  });
});
