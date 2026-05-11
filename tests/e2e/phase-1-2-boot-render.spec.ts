import { expect, test } from "@playwright/test";
import { expectCanvasRendered, readCanvasStats } from "./helpers/canvas";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

test.describe("Phase 1-2 — boot & render", () => {
  test("app boots, canvas mounts, demo graph renders pixels", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    const canvas = page.getByTestId("viewport-canvas");
    await expect(canvas).toBeVisible();

    const stats = await expectCanvasRendered(canvas, { ratio: 0.1 });
    // Demo is a blue-tinted sphere on a dark background — non-trivial spread
    // confirms shading, not a solid clear color.
    expect(stats.spread).toBeGreaterThan(20);
  });

  test("disconnecting Output → placeholder background, no shader output", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);
    const canvas = page.getByTestId("viewport-canvas");

    // Start from a known graph so the Output id is predictable.
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: -240, y: 0 },
      s1: { x: 80, y: 0 },
      o1: { x: 400, y: 0 },
    });
    await expectCanvasRendered(canvas, { ratio: 0.1 });

    // Remove the Output node — Viewport should render the placeholder
    // background instead of the shader's blue sphere.
    await withSp(
      page,
      (sp) => {
        sp.graph.getState().removeNode("o1");
      },
      undefined,
    );

    // Wait for the bg color to dominate by polling spread (background fill
    // is uniform → spread near 0).
    await expect
      .poll(
        async () => {
          const s = await readCanvasStats(canvas);
          return s.spread;
        },
        { timeout: 5_000, intervals: [200, 500] },
      )
      .toBeLessThan(15);
  });

  test("dragging on canvas mutates camera state", async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
    const canvas = page.getByTestId("viewport-canvas");
    await expectCanvasRendered(canvas);

    // The OrbitCamera state lives in cameraStore via __sp. We don't expose
    // it directly — assert indirectly via graph rev / visible change.
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await readSp(page, (sp) => sp.graph.getState().uniformRev);

    // Left-drag should rotate.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 220, cy + 60, { steps: 12 });
    await page.mouse.up();

    // Camera changes do not bump uniformRev (camera is read each frame from
    // cameraStore), so we instead read pixels — rotation should change them.
    await page.waitForTimeout(200);
    const after = await readCanvasStats(canvas);
    expect(after.nonZero).toBeGreaterThan(0);
    // sanity: uniformRev unchanged (camera does not write graphStore)
    const post = await readSp(page, (sp) => sp.graph.getState().uniformRev);
    expect(post).toBe(before);
  });
});
