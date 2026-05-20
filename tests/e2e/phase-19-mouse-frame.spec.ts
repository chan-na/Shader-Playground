import { expect, test } from "@playwright/test";
import { readCanvasStats } from "./helpers/canvas";
import { bootApp, setGraph } from "./helpers/fixtures";
import { readSp } from "./helpers/sp";

// Phase 19 — u_mouse / u_frame system uniforms. A single fullscreen shader
// paints the whole canvas with a flat color whose red = u_mouse.x / width and
// green = u_mouse.y / height (blue pinned to 0.5 so every pixel stays non-zero
// regardless of pointer position). Moving the pointer across the canvas must
// change the flat color, proving the pointer feeds u_mouse end-to-end
// (listener → mouseStore → dirty gate → bindSystemUniforms). u_frame is
// asserted indirectly via the recognized-as-system unit tests; here we focus
// on the live pointer path.

const MOUSE_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_mouse;
uniform vec2 u_resolution;
uniform float u_frame;
out vec4 fragColor;
void main() {
  // u_frame is referenced so the compiler keeps it live; it has no visual
  // effect here (kept tiny to avoid drift across the few frames we sample).
  float keep = clamp(u_frame * 0.0, 0.0, 1.0);
  fragColor = vec4(
    u_mouse.x / u_resolution.x,
    u_mouse.y / u_resolution.y,
    0.5 + keep,
    1.0
  );
}`;

function mouseGraph() {
  return {
    nodes: [
      {
        id: "mouseShader",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: MOUSE_FRAG,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "eo",
        source: "mouseShader",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

test.describe("Phase 19 — u_mouse / u_frame system uniforms", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("pointer position drives u_mouse and repaints the canvas", async ({
    page,
  }) => {
    const canvas = page.getByTestId("viewport-canvas");
    await setGraph(page, mouseGraph(), {});

    const rect = await canvas.boundingBox();
    if (!rect) throw new Error("canvas has no bounding box");

    // Bottom-left of the canvas: low clientX → low u_mouse.x → low red, and
    // bottom of screen (high clientY) → low u_mouse.y (origin flipped) → low
    // green. Poll until the flat color settles.
    await page.mouse.move(
      rect.x + rect.width * 0.15,
      rect.y + rect.height * 0.85,
    );
    let lowStats = await readCanvasStats(canvas);
    await expect
      .poll(async () => {
        lowStats = await readCanvasStats(canvas);
        return lowStats.avg.r + lowStats.avg.g;
      })
      .toBeLessThan(160);

    // Top-right: high clientX → high red, top of screen → high green.
    await page.mouse.move(
      rect.x + rect.width * 0.85,
      rect.y + rect.height * 0.15,
    );
    let highStats = await readCanvasStats(canvas);
    await expect
      .poll(async () => {
        highStats = await readCanvasStats(canvas);
        return highStats.avg.r + highStats.avg.g;
      })
      .toBeGreaterThan(240);

    // The pointer move must have raised both channels (loose margin tolerates
    // SwiftShader rounding and the sampled-region averaging).
    expect(highStats.avg.r).toBeGreaterThan(lowStats.avg.r + 30);
    expect(highStats.avg.g).toBeGreaterThan(lowStats.avg.g + 30);

    // The mouseStore must reflect the latest pointer position (bottom-left
    // origin: top-right screen → large x and large y).
    const mouse = await readSp(page, (sp) => sp.mouse.getState());
    expect(mouse.x).toBeGreaterThan(0);
    expect(mouse.y).toBeGreaterThan(0);
  });
});
