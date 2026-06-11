import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

/**
 * Phase 34 — GIF encoding progress.
 *
 * Phase 32 moved encoding to a worker but reported completion in a single
 * message, so the Toolbar's `⏳ GIF` chip gave no feedback during a multi-second
 * encode. The worker now posts one progress message per assembled frame; the
 * client forwards it to the recorder store's `encodeProgress` (0..1). Here we
 * drive the real worker path in chromium and assert progress climbs to a full
 * frame before the store returns to idle.
 */
test.describe("Phase 34 — GIF encode progress", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("recorder store exposes encodeProgress, idle at 0", async ({ page }) => {
    const state = await readSp(page, (sp) => {
      const g = sp.gifRecorder.getState();
      return { status: g.status, encodeProgress: g.encodeProgress };
    });
    expect(state.status).toBe("idle");
    expect(state.encodeProgress).toBe(0);
  });

  test("encodeProgress reaches 1 during a real worker encode", async ({
    page,
  }) => {
    // Play time so the RAF loop stays dirty and frames keep arriving.
    await withSp(page, (sp) => sp.time.getState().setPlaying(true), null);
    await withSp(
      page,
      (sp) =>
        sp.gifRecorder
          .getState()
          .start({ fps: 20, maxLongEdge: 64, maxSeconds: 5 }),
      null,
    );

    await expect
      .poll(() => readSp(page, (sp) => sp.gifRecorder.getState().frameCount), {
        timeout: 8_000,
        message: "GIF recorder never captured frames",
      })
      .toBeGreaterThanOrEqual(3);

    // Subscribe before stopping so transient progress values are captured even
    // though the store resets to 0 once it returns to idle.
    const result = await page.evaluate(async () => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp missing");
      let maxProgress = 0;
      const seen: number[] = [];
      const unsub = sp.gifRecorder.subscribe((s) => {
        seen.push(s.encodeProgress);
        if (s.encodeProgress > maxProgress) maxProgress = s.encodeProgress;
      });
      const blob = await sp.gifRecorder.getState().stop();
      unsub();
      return {
        ok: !!blob,
        maxProgress,
        // Progress values must be monotonic non-decreasing while encoding.
        monotonic: seen
          .filter((v) => v > 0)
          .every((v, i, a) => i === 0 || v >= (a[i - 1] ?? 0)),
        finalProgress: sp.gifRecorder.getState().encodeProgress,
        status: sp.gifRecorder.getState().status,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.maxProgress).toBeCloseTo(1, 5);
    expect(result.monotonic).toBe(true);
    // Reset to idle after the encode completes.
    expect(result.status).toBe("idle");
    expect(result.finalProgress).toBe(0);
  });
});
