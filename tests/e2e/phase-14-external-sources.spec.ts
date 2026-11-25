import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import { bootApp, setGraph } from "./helpers/fixtures";
import {
  expectNoRendererErrors,
  waitForNextRender,
  waitForStatsSamples,
} from "./helpers/render";
import { readSp, withSp } from "./helpers/sp";
import type { GraphNodeMinimal } from "./helpers/types";

// Phase 14 — external sources (webcam / video / audio). Each source is wired
// source → passthrough shader → output; with no mesh input ShaderPass
// auto-injects fullscreen.vert, so v_uv spans the whole canvas. The webcam
// reads Chromium's fake media device (playwright.config.ts launch args).
// Serialization round-trips of these nodes are unit-tested in
// src/state/serialization.test.ts.

/** Samples a 2D source texture straight to the framebuffer. */
const passthrough2d = (sampler: string) => `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D ${sampler};
out vec4 outColor;
void main() {
  outColor = texture(${sampler}, v_uv);
}`;

/** Writes the audio FFT bin amplitude as a horizontal bar — we only care
 *  that the 1D sampler compiles and runs. */
const AUDIO_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_audio;
out vec4 outColor;
void main() {
  float amp = texture(u_audio, vec2(v_uv.x, 0.5)).r;
  outColor = vec4(amp, amp, amp, 1.0);
}`;

function sourceGraph(
  source: GraphNodeMinimal,
  sampler: string,
  fragmentSource: string,
) {
  return {
    nodes: [
      source,
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "e1",
        source: source.id,
        sourceHandle: "texture",
        target: "s1",
        targetHandle: sampler,
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

interface SourceCase {
  label: string;
  id: string;
  sampler: string;
  fragment: string;
  /** Node used by the removal and no-asset tests. */
  node: GraphNodeMinimal;
  /** Node used by the paused-loop test, when it differs from `node`. */
  pausedNode?: GraphNodeMinimal;
  /** Status error an asset-less node must report, for asset-backed sources. */
  noAssetError?: RegExp;
}

const SOURCES: SourceCase[] = [
  {
    label: "webcam",
    id: "w1",
    sampler: "u_webcam",
    fragment: passthrough2d("u_webcam"),
    node: { id: "w1", kind: "webcam" },
  },
  {
    label: "video",
    id: "v1",
    sampler: "u_video",
    fragment: passthrough2d("u_video"),
    node: {
      id: "v1",
      kind: "video",
      assetId: null,
      playing: true,
      loop: true,
      muted: true,
    },
    noAssetError: /no video asset/i,
  },
  {
    label: "audio",
    id: "a1",
    sampler: "u_audio",
    fragment: AUDIO_FRAG,
    node: {
      id: "a1",
      kind: "audio",
      sourceKind: "file",
      assetId: null,
      fftSize: 256,
      smoothing: 0.8,
      playing: true,
      loop: true,
    },
    pausedNode: {
      id: "a1",
      kind: "audio",
      sourceKind: "mic",
      assetId: null,
      fftSize: 256,
      smoothing: 0.8,
      playing: true,
      loop: true,
    },
    noAssetError: /no audio asset/i,
  },
];

/** The external-source registry's status for a node (null until acquired). */
async function externalStatus(
  page: Page,
  nodeId: string,
): Promise<{ statusKind: string; error: string | null } | null> {
  return page.evaluate((id) => {
    // @ts-expect-error - Vite dev-server module path, not resolvable by tsc
    return import("/src/core/external/registry.ts").then((m) =>
      m.getExternalStatus(id),
    );
  }, nodeId);
}

function readDrawCalls(page: Page): Promise<number> {
  return readSp(page, (sp) => sp.renderer.getState().stats.drawCalls);
}

test.describe("Phase 14 — external sources", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("webcam → shader → output renders the fake media stream", async ({
    page,
  }) => {
    const webcam = SOURCES[0];
    if (!webcam) throw new Error("no webcam case");
    await setGraph(
      page,
      sourceGraph(webcam.node, webcam.sampler, webcam.fragment),
      {},
    );
    // The fake video device emits a synthetic colour-ball pattern; we just
    // verify the frame is non-uniform and not pure black.
    const stats = await expectCanvasRendered(
      page.getByTestId("viewport-canvas"),
      { ratio: 0.3, timeout: 15_000 },
    );
    expect(stats.spread).toBeGreaterThan(20);
  });

  for (const source of SOURCES) {
    const { noAssetError } = source;
    if (noAssetError) {
      test(`${source.label} node with no asset compiles, reports an error, and emits no runtime errors`, async ({
        page,
      }) => {
        await setGraph(
          page,
          sourceGraph(source.node, source.sampler, source.fragment),
          {},
        );
        // The status surface exposes the "no asset" error so the inspector
        // can render its placeholder copy.
        await expect
          .poll(async () => (await externalStatus(page, source.id))?.error)
          .toMatch(noAssetError);
        await waitForNextRender(page);
        await expectNoRendererErrors(page);
      });
    }

    test(`removing the ${source.label} node disposes cleanly with no runtime errors`, async ({
      page,
    }) => {
      await setGraph(
        page,
        sourceGraph(source.node, source.sampler, source.fragment),
        {},
      );
      // Let the async acquisition settle before tearing down.
      await expect
        .poll(async () => (await externalStatus(page, source.id))?.statusKind)
        .toMatch(/^(ready|error|denied)$/);
      await withSp(
        page,
        (sp, args) => sp.graph.getState().removeNode(args.id),
        { id: source.id },
      );
      await waitForNextRender(page);
      await expectNoRendererErrors(page);
      const remaining = await readSp(page, (sp) =>
        sp.graph.getState().nodes.map((n) => n.id),
      );
      expect(remaining).not.toContain(source.id);
    });

    test(`${source.label}: plan.hasExternal keeps the render loop alive when time is paused`, async ({
      page,
    }) => {
      await setGraph(
        page,
        sourceGraph(
          source.pausedNode ?? source.node,
          source.sampler,
          source.fragment,
        ),
        {},
      );
      await expect.poll(() => readDrawCalls(page)).toBeGreaterThan(0);
      await withSp(
        page,
        (sp) => sp.time.getState().setPlaying(false),
        undefined,
      );
      // drawCalls is published once per stats window; two windows guarantee
      // the sample reflects post-pause frames. The idle gate sets drawCalls=0
      // for static graphs while paused; external sources keep it > 0.
      await waitForStatsSamples(page, 2);
      expect(await readDrawCalls(page)).toBeGreaterThan(0);
    });
  }
});
