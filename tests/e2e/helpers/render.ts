import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { readSp } from "./sp";

/** The render loop's monotonic frame counter (bumped once per executed plan). */
export function readRenderTick(page: Page): Promise<number> {
  return readSp(page, (sp) => sp.renderer.getState().stats.renderTick);
}

/**
 * Assert the renderer recorded no runtime errors. By default this is a
 * snapshot of the current state; pass `{ eventually: true }` when the caller
 * is waiting for an in-flight recompile to clear earlier errors.
 */
export async function expectNoRendererErrors(
  page: Page,
  options: { eventually?: boolean } = {},
): Promise<void> {
  const read = () => readSp(page, (sp) => sp.renderer.getState().stats.errors);
  if (options.eventually) {
    await expect.poll(read).toEqual([]);
  } else {
    expect(await read()).toEqual([]);
  }
}

/**
 * Block until the render loop has executed a frame that started after this
 * call, so a store change made just before it has gone through the loop's
 * rebuild (and any error it raised has been recorded).
 */
export async function waitForNextRender(page: Page): Promise<void> {
  const before = await readRenderTick(page);
  await expect
    .poll(() => readRenderTick(page), {
      message: "render loop never ran another frame",
    })
    .toBeGreaterThan(before);
}

/**
 * Block until renderTick stops advancing, i.e. the idle gate has engaged
 * after a pause. Returns the settled tick.
 */
export async function waitForRenderIdle(page: Page): Promise<number> {
  let previous = -1;
  await expect
    .poll(
      async () => {
        const tick = await readRenderTick(page);
        const settled = tick === previous;
        previous = tick;
        return settled;
      },
      { message: "renderTick never stopped advancing", intervals: [250] },
    )
    .toBe(true);
  return readRenderTick(page);
}

/**
 * Resolve once the render loop has published `count` more stats samples. The
 * loop folds fps/frame/drawCalls into the store once per ~500ms window, so a
 * stats field read right after a state change still describes the window
 * before it.
 */
export async function waitForStatsSamples(
  page: Page,
  count = 2,
): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve, reject) => {
        const sp = window.__sp;
        if (!sp) throw new Error("__sp not exposed");
        let seen = 0;
        const timer = setTimeout(() => {
          unsubscribe();
          reject(new Error(`only ${seen}/${count} stats samples arrived`));
        }, 10_000);
        // A sample is a `setStats` write: a new stats object whose renderTick
        // and errors are untouched (those have their own writers).
        const unsubscribe = sp.renderer.subscribe((next, prev) => {
          if (
            next.stats === prev.stats ||
            next.stats.renderTick !== prev.stats.renderTick ||
            next.stats.errors !== prev.stats.errors
          ) {
            return;
          }
          seen += 1;
          if (seen >= count) {
            clearTimeout(timer);
            unsubscribe();
            resolve();
          }
        });
      }),
    count,
  );
}
