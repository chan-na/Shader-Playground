import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import { bootApp, setGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Passthrough fragment that samples the webcam texture and writes it straight
// to the framebuffer. No mesh input → ShaderPass auto-injects fullscreen.vert,
// so a_uv is wired to v_uv and the whole canvas reflects the camera frame.
const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_webcam;
out vec4 outColor;
void main() {
  outColor = texture(u_webcam, v_uv);
}`;

function webcamGraph() {
  return {
    nodes: [
      { id: "w1", kind: "webcam" as const },
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: PASSTHROUGH_FRAG,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "e1",
        source: "w1",
        sourceHandle: "texture",
        target: "s1",
        targetHandle: "u_webcam",
      },
      {
        id: "e2",
        source: "s1",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

test.describe("Phase 14 — webcam external source", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("webcam → shader → output renders the fake media stream", async ({
    page,
  }) => {
    await setGraph(page, webcamGraph(), {});
    const canvas = page.getByTestId("viewport-canvas");
    // The Chromium fake video device emits a synthetic color-ball pattern; we
    // just verify the frame is non-uniform and not pure black.
    const stats = await expectCanvasRendered(canvas, {
      ratio: 0.3,
      timeout: 15_000,
    });
    expect(stats.spread).toBeGreaterThan(20);
  });

  test("removing the webcam node disposes cleanly with no runtime errors", async ({
    page,
  }) => {
    await setGraph(page, webcamGraph(), {});
    // Let the async acquisition settle before tearing down.
    await page.waitForTimeout(800);
    await withSp(page, (sp) => sp.graph.getState().removeNode("w1"), undefined);
    await page.waitForTimeout(300);
    const errors = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.errors,
    );
    expect(errors).toEqual([]);
    const remaining = await readSp(page, (sp) =>
      sp.graph.getState().nodes.map((n) => n.id),
    );
    expect(remaining).not.toContain("w1");
  });

  test("webcam node survives serialization round-trip (Share URL path)", async ({
    page,
  }) => {
    await setGraph(page, webcamGraph(), {});
    const restored = await page.evaluate(async () => {
      // @ts-expect-error - dev path
      const mod = await import("/src/state/serialization.ts");
      const sp = window.__sp;
      if (!sp) return null;
      const g = sp.graph.getState();
      const serialized = (
        mod.serializeProject as (
          g: unknown,
          p: unknown,
        ) => Record<string, unknown>
      )({ nodes: g.nodes, edges: g.edges }, g.positions);
      const json = JSON.parse(JSON.stringify(serialized));
      const out = (
        mod.deserializeProject as (raw: unknown) => {
          graph: { nodes: Array<{ id: string; kind: string }> };
        }
      )(json);
      return out.graph.nodes
        .filter((n) => n.kind === "webcam")
        .map((n) => n.id);
    });
    expect(restored).toEqual(["w1"]);
  });

  test("plan.hasExternal keeps the render loop alive when time is paused", async ({
    page,
  }) => {
    await setGraph(page, webcamGraph(), {});
    await page.waitForTimeout(800);
    await withSp(page, (sp) => sp.time.getState().setPlaying(false), undefined);
    // stats.drawCalls is recomputed every 500ms; wait two windows so the
    // sample reflects post-pause behavior. The idle gate sets drawCalls=0
    // for static graphs while paused; external sources keep it > 0.
    await page.waitForTimeout(1100);
    const drawCalls = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.drawCalls,
    );
    expect(drawCalls).toBeGreaterThan(0);
  });
});
