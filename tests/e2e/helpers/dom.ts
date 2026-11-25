import type { Locator, Page } from "@playwright/test";

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Horizontal centre — where a real pointer aims at the element. */
  cx: number;
  /** Vertical centre. */
  cy: number;
}

/**
 * A locator's layout box plus its centre. `boundingBox()` returns null only
 * for something that is not laid out at all, which no caller wants folded
 * into arithmetic, so this throws naming the element instead.
 */
export async function boxOf(
  locator: Locator,
  what: string = String(locator),
): Promise<LayoutBox> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no bounding box`);
  return { ...box, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/**
 * Drop focus from whatever holds it (usually a CodeMirror editor) so the next
 * keystroke reaches the global window shortcut listener.
 */
export async function blurActive(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
}
