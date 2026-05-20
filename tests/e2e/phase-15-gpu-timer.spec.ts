import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

/**
 * SwiftShader (Playwright's headless GL) happens to expose
 * EXT_disjoint_timer_query_webgl2, so these tests exercise the supported
 * path end-to-end: pool creates, samples land in the store, the chip / status
 * column render. We assert on element presence and shape — not on specific
 * ms values, since SwiftShader timings are emulated and not a useful budget.
 *
 * The unsupported path is covered by unit tests
 * (`gpuTimer.test.ts` returns null without the extension, `gpuTimerStore.test.ts`
 * verifies the clean-on-disable behavior).
 */
test.describe("Phase 15 — GPU timer overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("store shape and supported flag are exposed", async ({ page }) => {
    const state = await readSp(page, (sp) => sp.gpuTimer.getState());
    expect(typeof state.supported).toBe("boolean");
    expect(typeof state.enabled).toBe("boolean");
    expect(typeof state.totalMs).toBe("number");
    expect(typeof state.byNode).toBe("object");
  });

  test("renders the ms chip on a shader node when supported", async ({
    page,
  }) => {
    const supported = await readSp(
      page,
      (sp) => sp.gpuTimer.getState().supported,
    );
    test.skip(
      !supported,
      "Extension EXT_disjoint_timer_query_webgl2 not exposed in this environment",
    );
    await setGraph(page, trivialMeshGraph(), {});
    const chip = page.getByTestId("gpu-ms-s1");
    // Timer queries trail by a few frames; allow generous timeout for the
    // first sample to land via poll → setSample.
    await expect(chip).toHaveCount(1, { timeout: 5_000 });
    await expect(chip).toContainText(/ms$/);
  });

  test("StatusBar exposes the GPU total when enabled", async ({ page }) => {
    const supported = await readSp(
      page,
      (sp) => sp.gpuTimer.getState().supported,
    );
    test.skip(!supported, "extension not exposed");
    await setGraph(page, trivialMeshGraph(), {});
    const statusGpu = page.getByTestId("status-gpu-ms");
    await expect(statusGpu).toBeVisible({ timeout: 5_000 });
    await expect(statusGpu).toContainText(/ms GPU$/);
  });

  test("disabling the timer hides the chip and the StatusBar column", async ({
    page,
  }) => {
    const supported = await readSp(
      page,
      (sp) => sp.gpuTimer.getState().supported,
    );
    test.skip(!supported, "extension not exposed");
    await setGraph(page, trivialMeshGraph(), {});
    // Wait for at least one sample so we're definitely toggling away from a
    // "showing" state, not from a "not-yet-rendered" one.
    await expect(page.getByTestId("gpu-ms-s1")).toHaveCount(1, {
      timeout: 5_000,
    });
    await withSp(
      page,
      (sp) => sp.gpuTimer.getState().setEnabled(false),
      undefined,
    );
    await expect(page.getByTestId("gpu-ms-s1")).toHaveCount(0);
    await expect(page.getByTestId("status-gpu-ms")).toHaveCount(0);
    // Re-enabling brings the chip back after the next sample lands.
    await withSp(
      page,
      (sp) => sp.gpuTimer.getState().setEnabled(true),
      undefined,
    );
    await expect(page.getByTestId("gpu-ms-s1")).toHaveCount(1, {
      timeout: 5_000,
    });
  });

  test("removing a shader node drops its timing sample", async ({ page }) => {
    const supported = await readSp(
      page,
      (sp) => sp.gpuTimer.getState().supported,
    );
    test.skip(!supported, "extension not exposed");
    await setGraph(page, trivialMeshGraph(), {});
    await expect(page.getByTestId("gpu-ms-s1")).toHaveCount(1, {
      timeout: 5_000,
    });
    await withSp(page, (sp) => sp.graph.getState().removeNode("s1"), undefined);
    // The RAF tick that observes the rev change runs recompile() which
    // releases the timer slot and the store entry. Poll until the cleanup
    // has propagated rather than asserting on the same microtask.
    await expect
      .poll(
        async () =>
          await readSp(
            page,
            (sp) => sp.gpuTimer.getState().byNode.s1 !== undefined,
          ),
        { timeout: 5_000 },
      )
      .toBe(false);
  });
});
