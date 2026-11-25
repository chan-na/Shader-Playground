/** Class the Viewport puts on its WebGL canvas — also what code outside the
 * Viewport (toolbar recording, Export & Share) uses to find it. */
export const VIEWPORT_CANVAS_CLASS = "viewport-canvas";

/** The mounted Viewport canvas, or null while the Viewport panel is closed. */
export function getViewportCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(`.${VIEWPORT_CANVAS_CLASS}`);
}
