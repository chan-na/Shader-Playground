import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

/**
 * Phase 31 — animated GIF recording.
 *
 * The encoder (quantizer + LZW + GIF89a assembler) is covered by Vitest unit
 * tests with an independent decoder. Here we exercise the live recorder
 * wiring: store shape, the render loop staying awake while recording, and the
 * toolbar button. Capture-and-decode with the default options (dithering +
 * per-frame palettes) is checked against the browser's own GIF decoder in
 * phase-33-gif-quality.spec.ts.
 */
test.describe("Phase 31 — GIF recording", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("recorder store shape is exposed", async ({ page }) => {
    const state = await readSp(page, (sp) => {
      const g = sp.gifRecorder.getState();
      return {
        status: g.status,
        frameCount: g.frameCount,
        startFn: typeof g.start,
        stopFn: typeof g.stop,
      };
    });
    expect(state.status).toBe("idle");
    expect(state.frameCount).toBe(0);
    expect(state.startFn).toBe("function");
    expect(state.stopFn).toBe("function");
  });

  test("recording keeps the render loop awake while paused", async ({
    page,
  }) => {
    // Pause time: with no recording and a static graph the loop idles.
    await withSp(page, (sp) => sp.time.getState().setPlaying(false), null);
    const tickBefore = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.renderTick,
    );

    await withSp(
      page,
      (sp) => sp.gifRecorder.getState().start({ fps: 20, maxLongEdge: 48 }),
      null,
    );

    // hasExternal/gifRecording forces dirty frames even though time is paused.
    await expect
      .poll(() => readSp(page, (sp) => sp.gifRecorder.getState().frameCount), {
        timeout: 8_000,
        message: "paused recording captured no frames",
      })
      .toBeGreaterThanOrEqual(2);

    const tickAfter = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.renderTick,
    );
    expect(tickAfter).toBeGreaterThan(tickBefore);

    // Clean up the singleton (discard the blob).
    await withSp(
      page,
      async (sp) => {
        await sp.gifRecorder.getState().stop();
      },
      null,
    );
  });

  test("toolbar GIF button starts recording", async ({ page }) => {
    const button = page.getByRole("button", {
      name: "Start recording viewport to animated GIF",
    });
    await expect(button).toBeVisible();
    await button.click();
    expect(await readSp(page, (sp) => sp.gifRecorder.getState().status)).toBe(
      "recording",
    );
    // Stop via the store so no file download is triggered by the stop button.
    await withSp(
      page,
      async (sp) => {
        await sp.gifRecorder.getState().stop();
      },
      null,
    );
  });
});
