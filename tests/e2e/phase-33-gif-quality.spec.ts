import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

/**
 * Phase 33 — GIF per-frame local palette + Floyd–Steinberg dithering.
 *
 * The encoder branches (global shared table vs per-frame local tables) and the
 * dithering math are unit-tested with an independent decoder. Here we prove
 * that *both* live encoder paths emit bytes the browser's own GIF decoder
 * (`createImageBitmap`) accepts — the authoritative spec check. A malformed
 * local color table or LZW min-code-size would make the decode throw.
 */
test.describe("Phase 33 — GIF quality", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  async function recordAndDecode(
    page: import("@playwright/test").Page,
    options: { dither: boolean; localPalette: boolean },
  ) {
    await withSp(page, (sp) => sp.time.getState().setPlaying(true), null);
    await withSp(
      page,
      (sp, opts) =>
        sp.gifRecorder
          .getState()
          .start({ fps: 20, maxLongEdge: 64, maxSeconds: 5, ...opts }),
      options,
    );

    await expect
      .poll(() => readSp(page, (sp) => sp.gifRecorder.getState().frameCount), {
        timeout: 8_000,
        message: "GIF recorder never captured frames",
      })
      .toBeGreaterThanOrEqual(3);

    return page.evaluate(async () => {
      const sp = window.__sp;
      if (!sp) throw new Error("__sp missing");
      const blob = await sp.gifRecorder.getState().stop();
      if (!blob) return null;
      const buf = new Uint8Array(await blob.arrayBuffer());
      const magic = String.fromCharCode(...Array.from(buf.slice(0, 6)));
      // Logical Screen Descriptor packed byte (offset 10): bit 7 = global
      // color table flag. Lets us assert the local-palette path drops the GCT.
      const lsdPacked = buf[10] ?? 0;
      const hasGlobalTable = (lsdPacked & 0x80) !== 0;
      // The browser's GIF decoder is the authoritative validator.
      const bmp = await createImageBitmap(blob);
      return {
        type: blob.type,
        size: buf.length,
        magic,
        hasGlobalTable,
        width: bmp.width,
        height: bmp.height,
      };
    });
  }

  test("per-frame local palette + dithering decodes in the browser", async ({
    page,
  }) => {
    const result = await recordAndDecode(page, {
      dither: true,
      localPalette: true,
    });
    expect(result).not.toBeNull();
    expect(result?.type).toBe("image/gif");
    expect(result?.magic).toBe("GIF89a");
    expect(result?.size ?? 0).toBeGreaterThan(0);
    // Local-palette mode omits the global color table.
    expect(result?.hasGlobalTable).toBe(false);
    expect(result?.width ?? 0).toBeGreaterThan(0);
    expect(result?.width ?? 999).toBeLessThanOrEqual(64);
    expect(result?.height ?? 0).toBeGreaterThan(0);
  });

  test("global shared palette path still decodes (localPalette off)", async ({
    page,
  }) => {
    const result = await recordAndDecode(page, {
      dither: true,
      localPalette: false,
    });
    expect(result).not.toBeNull();
    expect(result?.magic).toBe("GIF89a");
    // Shared-palette mode keeps the global color table.
    expect(result?.hasGlobalTable).toBe(true);
    expect(result?.width ?? 0).toBeGreaterThan(0);
    expect(await readSp(page, (sp) => sp.gifRecorder.getState().status)).toBe(
      "idle",
    );
  });
});
