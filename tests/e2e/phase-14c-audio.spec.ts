import { expect, test } from "@playwright/test";
import { bootApp, setGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Passthrough fragment that samples the audio FFT 1D texture and writes the
// bin amplitude as a horizontal bar. Mirrors the video passthrough used in
// phase-14b — we only care that the sampler compiles and runs without errors.
const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_audio;
out vec4 outColor;
void main() {
  float amp = texture(u_audio, vec2(v_uv.x, 0.5)).r;
  outColor = vec4(amp, amp, amp, 1.0);
}`;

function audioGraph(opts?: {
  sourceKind?: "mic" | "file";
  assetId?: string | null;
}) {
  return {
    nodes: [
      {
        id: "a1",
        kind: "audio" as const,
        sourceKind: opts?.sourceKind ?? "file",
        assetId: opts?.assetId ?? null,
        fftSize: 256,
        smoothing: 0.8,
        playing: true,
        loop: true,
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
        source: "a1",
        sourceHandle: "texture",
        target: "s1",
        targetHandle: "u_audio",
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

test.describe("Phase 14c — audio external source", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("audio file node with no asset compiles, reports an error, and emits no runtime errors", async ({
    page,
  }) => {
    await setGraph(page, audioGraph({ sourceKind: "file", assetId: null }), {});
    await page.waitForTimeout(500);
    const errors = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.errors,
    );
    expect(errors).toEqual([]);
    const status = await page.evaluate(() => {
      // @ts-expect-error - dev path
      return import("/src/core/external/registry.ts").then((m) =>
        m.getExternalStatus("a1"),
      );
    });
    expect(status).not.toBeNull();
    expect(status?.error).toMatch(/no audio asset/i);
  });

  test("removing the audio node disposes cleanly with no runtime errors", async ({
    page,
  }) => {
    await setGraph(page, audioGraph(), {});
    await page.waitForTimeout(400);
    await withSp(page, (sp) => sp.graph.getState().removeNode("a1"), undefined);
    await page.waitForTimeout(300);
    const errors = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.errors,
    );
    expect(errors).toEqual([]);
    const remaining = await readSp(page, (sp) =>
      sp.graph.getState().nodes.map((n) => n.id),
    );
    expect(remaining).not.toContain("a1");
  });

  test("audio node survives serialization round-trip (Share URL path)", async ({
    page,
  }) => {
    await setGraph(
      page,
      audioGraph({ sourceKind: "file", assetId: "asset-abc" }),
      {},
    );
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
              sourceKind?: string;
              assetId?: string | null;
              fftSize?: number;
              smoothing?: number;
              playing?: boolean;
              loop?: boolean;
            }>;
          };
        }
      )(json);
      const a = out.graph.nodes.find((n) => n.kind === "audio");
      return a
        ? {
            id: a.id,
            sourceKind: a.sourceKind,
            assetId: a.assetId,
            fftSize: a.fftSize,
            smoothing: a.smoothing,
            playing: a.playing,
            loop: a.loop,
          }
        : null;
    });
    expect(restored).toEqual({
      id: "a1",
      sourceKind: "file",
      assetId: "asset-abc",
      fftSize: 256,
      smoothing: 0.8,
      playing: true,
      loop: true,
    });
  });

  test("plan.hasExternal keeps the render loop alive when time is paused", async ({
    page,
  }) => {
    await setGraph(page, audioGraph({ sourceKind: "mic" }), {});
    await page.waitForTimeout(500);
    await withSp(page, (sp) => sp.time.getState().setPlaying(false), undefined);
    // Same 1100ms window as phase-14b — stats are sampled every 500ms.
    await page.waitForTimeout(1100);
    const drawCalls = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.drawCalls,
    );
    expect(drawCalls).toBeGreaterThan(0);
  });
});
