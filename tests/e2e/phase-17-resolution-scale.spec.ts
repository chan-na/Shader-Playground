import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import { bootApp, setGraph } from "./helpers/fixtures";
import { readSp, waitForRev } from "./helpers/sp";

// Phase 17 — per-pass resolution scale. A downsample chain renders a gradient
// into a 0.25× intermediate FBO, then a second full-resolution pass samples it
// back through normalized UVs. We assert the chain still produces pixels and
// that the Inspector dropdown round-trips the scale into the store.

const GRADIENT_FRAG = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(uv, 0.5, 1.0);
}`;

const SAMPLE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_resolution;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = texture(u_src, uv);
}`;

function downsampleChain(genScale: 0.25 | 0.5 | 1) {
  return {
    nodes: [
      {
        id: "gen",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: GRADIENT_FRAG,
        uniformValues: {},
        resolutionScale: genScale,
      },
      {
        id: "ds",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: SAMPLE_FRAG,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "e1",
        source: "gen",
        sourceHandle: "texture",
        target: "ds",
        targetHandle: "u_src",
      },
      {
        id: "e2",
        source: "ds",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

test.describe("Phase 17 — per-pass resolution scale", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("0.25× downsample chain still renders a gradient", async ({ page }) => {
    const canvas = page.getByTestId("viewport-canvas");
    await setGraph(page, downsampleChain(0.25), {});

    // The generated gradient sampled back to full res must still vary across
    // the frame — a collapsed/zero FBO would render uniform or empty.
    const stats = await expectCanvasRendered(canvas, { ratio: 0.5 });
    expect(stats.spread).toBeGreaterThan(20);

    const scale = await readSp(
      page,
      (sp) =>
        sp.graph.getState().nodes.find((n) => n.id === "gen")?.resolutionScale,
    );
    expect(scale).toBe(0.25);
  });

  test("Inspector dropdown round-trips the scale into the store", async ({
    page,
  }) => {
    const canvas = page.getByTestId("viewport-canvas");
    await setGraph(page, downsampleChain(1), {});
    await expectCanvasRendered(canvas, { ratio: 0.5 });

    // Select the generator node so the Inspector targets it.
    await readSp(page, (sp) => sp.selection.getState().select("gen"));

    const select = page.getByTestId("resolution-scale");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("1");

    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    await select.selectOption("0.25");
    await waitForRev(page, before);

    const scale = await readSp(
      page,
      (sp) =>
        sp.graph.getState().nodes.find((n) => n.id === "gen")?.resolutionScale,
    );
    expect(scale).toBe(0.25);

    // Recompiled chain still renders after the scale change.
    const stats = await expectCanvasRendered(canvas, { ratio: 0.5 });
    expect(stats.spread).toBeGreaterThan(20);
  });
});
