import { expect, test } from "@playwright/test";
import { bootApp, setGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Passthrough fragment that samples the video texture; mirrors the webcam
// passthrough in phase-14-webcam.spec.ts.
const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_video;
out vec4 outColor;
void main() {
  outColor = texture(u_video, v_uv);
}`;

function videoGraph(opts?: { assetId?: string | null }) {
  return {
    nodes: [
      {
        id: "v1",
        kind: "video" as const,
        assetId: opts?.assetId ?? null,
        playing: true,
        loop: true,
        muted: true,
      },
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
        source: "v1",
        sourceHandle: "texture",
        target: "s1",
        targetHandle: "u_video",
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

test.describe("Phase 14b — video external source", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("video node with no asset compiles, reports an error, and emits no runtime errors", async ({
    page,
  }) => {
    await setGraph(page, videoGraph({ assetId: null }), {});
    // Give the compile + RAF a tick to settle.
    await page.waitForTimeout(500);
    const errors = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.errors,
    );
    expect(errors).toEqual([]);
    // The status surface should expose the "no asset" error so the inspector
    // can render the placeholder copy.
    const status = await page.evaluate(() => {
      // @ts-expect-error - dev path
      return import("/src/core/external/registry.ts").then((m) =>
        m.getExternalStatus("v1"),
      );
    });
    expect(status).not.toBeNull();
    expect(status?.error).toMatch(/no video asset/i);
  });

  test("removing the video node disposes cleanly with no runtime errors", async ({
    page,
  }) => {
    await setGraph(page, videoGraph(), {});
    await page.waitForTimeout(400);
    await withSp(page, (sp) => sp.graph.getState().removeNode("v1"), undefined);
    await page.waitForTimeout(300);
    const errors = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.errors,
    );
    expect(errors).toEqual([]);
    const remaining = await readSp(page, (sp) =>
      sp.graph.getState().nodes.map((n) => n.id),
    );
    expect(remaining).not.toContain("v1");
  });

  test("video node survives serialization round-trip (Share URL path)", async ({
    page,
  }) => {
    await setGraph(page, videoGraph({ assetId: "asset-xyz" }), {});
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
          graph: {
            nodes: Array<{
              id: string;
              kind: string;
              assetId?: string | null;
              loop?: boolean;
              muted?: boolean;
              playing?: boolean;
            }>;
          };
        }
      )(json);
      const v = out.graph.nodes.find((n) => n.kind === "video");
      return v
        ? {
            id: v.id,
            assetId: v.assetId,
            loop: v.loop,
            muted: v.muted,
            playing: v.playing,
          }
        : null;
    });
    expect(restored).toEqual({
      id: "v1",
      assetId: "asset-xyz",
      loop: true,
      muted: true,
      playing: true,
    });
  });

  test("plan.hasExternal keeps the render loop alive when time is paused", async ({
    page,
  }) => {
    await setGraph(page, videoGraph(), {});
    await page.waitForTimeout(500);
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
