import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

/**
 * Phase 31 — animated GIF recording.
 *
 * The encoder (quantizer + LZW + GIF89a assembler) is covered by Vitest unit
 * tests with an independent decoder. Here we exercise the live path: the
 * Viewport RAF captures the real canvas while recording, and the produced blob
 * is validated against the browser's own GIF decoder (`createImageBitmap`),
 * which is the authoritative spec check — if the bytes were malformed the
 * decode would throw.
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

  test("captures frames and encodes a spec-valid GIF", async ({ page }) => {
    // Play time so the render loop stays dirty and frames keep arriving.
    await withSp(page, (sp) => sp.time.getState().setPlaying(true), null);
    await withSp(
      page,
      (sp) =>
        sp.gifRecorder
          .getState()
          .start({ fps: 20, maxLongEdge: 64, maxSeconds: 5 }),
      null,
    );

    // The RAF loop in the Viewport should accumulate captured frames.
    await expect
      .poll(() => readSp(page, (sp) => sp.gifRecorder.getState().frameCount), {
        timeout: 8_000,
        message: "GIF recorder never captured frames",
      })
      .toBeGreaterThanOrEqual(3);

    const result = await page.evaluate(async () => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp missing");
      const blob = await sp.gifRecorder.getState().stop();
      if (!blob) return null;
      const buf = new Uint8Array(await blob.arrayBuffer());
      const magic = String.fromCharCode(...Array.from(buf.slice(0, 6)));
      // The browser's GIF decoder is the authoritative validator.
      const bmp = await createImageBitmap(blob);
      return {
        type: blob.type,
        size: buf.length,
        magic,
        width: bmp.width,
        height: bmp.height,
      };
    });

    expect(result).not.toBeNull();
    expect(result?.type).toBe("image/gif");
    expect(result?.magic).toBe("GIF89a");
    expect(result?.size ?? 0).toBeGreaterThan(0);
    expect(result?.width ?? 0).toBeGreaterThan(0);
    expect(result?.width ?? 999).toBeLessThanOrEqual(64);
    expect(result?.height ?? 0).toBeGreaterThan(0);
    expect(result?.height ?? 999).toBeLessThanOrEqual(64);

    expect(await readSp(page, (sp) => sp.gifRecorder.getState().status)).toBe(
      "idle",
    );
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
    await page.evaluate(async () => {
      await window.__sp?.gifRecorder.getState().stop();
    });
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
    await page.evaluate(async () => {
      await window.__sp?.gifRecorder.getState().stop();
    });
  });
});
