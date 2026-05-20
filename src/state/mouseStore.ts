import { create } from "zustand";

/**
 * Pointer position over the viewport canvas, fed to the `u_mouse` system
 * uniform. Coordinates are in framebuffer pixels with a bottom-left origin so
 * they share the space of `gl_FragCoord` / `u_resolution` (Shadertoy iMouse
 * convention). `u_mouse` is bound as a vec4: `xy` = current position, `zw` =
 * the last pointer-down position.
 */
export interface MouseState {
  /** Current pointer position (framebuffer pixels, bottom-left origin). */
  x: number;
  y: number;
  /** Position of the last pointer-down. */
  clickX: number;
  clickY: number;
  down: boolean;
  /**
   * Bumped on every pointer mutation; the RAF loop reads this to wake from
   * idle when the user moves the mouse while paused.
   */
  rev: number;

  /** Pointer moved to (x, y). */
  setPosition: (x: number, y: number) => void;
  /** Pointer pressed at (x, y) — also records the click position. */
  setDown: (x: number, y: number) => void;
  /** Pointer released. */
  setUp: () => void;
  reset: () => void;
}

export const useMouseStore = create<MouseState>((set) => ({
  x: 0,
  y: 0,
  clickX: 0,
  clickY: 0,
  down: false,
  rev: 0,
  setPosition: (x, y) => set((s) => ({ x, y, rev: s.rev + 1 })),
  setDown: (x, y) =>
    set((s) => ({ x, y, clickX: x, clickY: y, down: true, rev: s.rev + 1 })),
  setUp: () => set((s) => ({ down: false, rev: s.rev + 1 })),
  reset: () =>
    set((s) => ({
      x: 0,
      y: 0,
      clickX: 0,
      clickY: 0,
      down: false,
      rev: s.rev + 1,
    })),
}));

/** Snapshot the pointer as the vec4 `u_mouse` value (xy=current, zw=click). */
export function mouseVec4(s: MouseState): [number, number, number, number] {
  return [s.x, s.y, s.clickX, s.clickY];
}
